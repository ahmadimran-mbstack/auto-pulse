import datetime
import hashlib
from urllib.parse import parse_qs, urlparse
import pytest
from sqlalchemy import text
from app.core.config import settings
from app.core.crypto import decrypt_text
from app.repositories import connection as connection_repo
from app.services import linkedin as linkedin_service
from tests.conftest import create_test_token


@pytest.fixture
def auth_headers_user_a(ed25519_keys):
    private_key, _ = ed25519_keys
    token = create_test_token(
        private_key,
        sub="user-a-111",
        email="usera@example.com",
        name="User Alpha",
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers_user_b(ed25519_keys):
    private_key, _ = ed25519_keys
    token = create_test_token(
        private_key,
        sub="user-b-222",
        email="userb@example.com",
        name="User Bravo",
    )
    return {"Authorization": f"Bearer {token}"}


# 1. Start returns a URL with the right parameters and stores only a SHA-256 hash of the state
def test_start_returns_correct_url_and_stores_hash(client, db_test_schema, auth_headers_user_a):
    response = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    assert response.status_code == 200
    data = response.json()
    assert "authorization_url" in data

    url = data["authorization_url"]
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    assert params["client_id"] == [settings.LINKEDIN_CLIENT_ID]
    assert params["redirect_uri"] == [settings.LINKEDIN_REDIRECT_URI]
    assert params["scope"] == ["openid profile w_member_social"]
    assert params["response_type"] == ["code"]
    assert "state" in params

    raw_state = params["state"][0]
    expected_hash = hashlib.sha256(raw_state.encode("utf-8")).hexdigest()

    # Verify the database table oauth_states stores the hash and never the raw state
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT state_hash, user_id, provider FROM oauth_states WHERE state_hash = :hash"),
            {"hash": expected_hash},
        ).fetchone()

        assert row is not None
        assert row[0] == expected_hash
        assert row[1] == "user-a-111"
        assert row[2] == "linkedin"

        # Verify raw state string does not exist as primary key in table
        raw_lookup = db.execute(
            text("SELECT 1 FROM oauth_states WHERE state_hash = :raw"),
            {"raw": raw_state},
        ).fetchone()
        assert raw_lookup is None


# 2. Test that claiming a state twice with the atomic statement returns nothing on the second call
def test_claim_state_twice_returns_none(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        state = connection_repo.create_oauth_state(db, user_id="user-a-111", provider="linkedin")

        # First claim should succeed and return provider
        first_claim = connection_repo.claim_oauth_state(db, user_id="user-a-111", raw_state=state)
        assert first_claim == "linkedin"

        # Second claim with the same state must return None
        second_claim = connection_repo.claim_oauth_state(db, user_id="user-a-111", raw_state=state)
        assert second_claim is None


# 3. Callback with good state and code saves connection and returns summary without tokens
def test_callback_saves_connection_without_tokens(
    client, db_test_schema, auth_headers_user_a, monkeypatch
):
    # Obtain a valid state
    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    # Mock external LinkedIn endpoints
    fake_token = "fake_linkedin_access_token_xyz"
    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: (fake_token, 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("linkedin-sub-001", "Alex Smith"),
    )

    callback_res = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "auth_code_123", "state": state},
    )
    assert callback_res.status_code == 200
    data = callback_res.json()

    # Verify summary fields
    assert data["provider"] == "linkedin"
    assert data["status"] == "active"
    assert data["account_name"] == "Alex Smith"
    assert data["days_left"] >= 59

    # Verify no tokens leaked in the API response
    res_text = callback_res.text
    assert fake_token not in res_text
    assert "token" not in data
    assert "access_token" not in data
    assert "access_token_enc" not in data


# 4. Token column in database is encrypted and decrypt gives the original value
def test_token_columns_are_encrypted_in_database(
    client, db_test_schema, auth_headers_user_a, monkeypatch
):
    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    secret_token = "super_secret_access_token_abc"
    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: (secret_token, 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("linkedin-sub-002", "Morgan Lee"),
    )

    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "auth_code_456", "state": state},
    )

    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT access_token_enc FROM social_connections WHERE user_id = 'user-a-111'")
        ).fetchone()

        assert row is not None
        stored_enc = row[0]

        # Plain token text must not appear anywhere in stored string
        assert secret_token not in stored_enc

        # Decrypting stored ciphertext yields original token
        assert decrypt_text(stored_enc) == secret_token


# 5. Replay, expired state, and cross-user state attacks fail with invalid_state
def test_state_validation_rules(
    client, db_test_schema, auth_headers_user_a, auth_headers_user_b, monkeypatch
):
    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: ("token", 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-x", "Name"),
    )

    # User A starts flow
    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    # Attack 1: User B tries to redeem User A's state
    res_b = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_b,
        json={"code": "code-1", "state": state},
    )
    assert res_b.status_code == 400
    assert res_b.json()["error"]["code"] == "invalid_state"
    assert res_b.json()["error"]["message"] == "This connection link is no longer valid. Start again."

    # User A successfully redeems their state
    res_a1 = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-2", "state": state},
    )
    assert res_a1.status_code == 200

    # Attack 2: Replay attack with already used state
    res_a2 = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-3", "state": state},
    )
    assert res_a2.status_code == 400
    assert res_a2.json()["error"]["code"] == "invalid_state"

    # Attack 3: Expired state
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        expired_state = connection_repo.create_oauth_state(db, user_id="user-a-111", provider="linkedin")
        expired_hash = hashlib.sha256(expired_state.encode("utf-8")).hexdigest()
        # Set expiry in the past
        db.execute(
            text("UPDATE oauth_states SET expires_at = now() - interval '1 hour' WHERE state_hash = :h"),
            {"h": expired_hash},
        )
        db.commit()

    res_expired = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-4", "state": expired_state},
    )
    assert res_expired.status_code == 400
    assert res_expired.json()["error"]["code"] == "invalid_state"


# 6. User B calling GET /connections never sees User A's connection
def test_user_isolation_get_connections(
    client, db_test_schema, auth_headers_user_a, auth_headers_user_b, monkeypatch
):
    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: ("token-a", 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-a", "User A"),
    )

    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-a", "state": state},
    )

    # User A sees their connection
    res_a = client.get("/connections", headers=auth_headers_user_a)
    assert res_a.status_code == 200
    assert len(res_a.json()) == 1
    assert res_a.json()[0]["account_name"] == "User A"

    # User B sees an empty list
    res_b = client.get("/connections", headers=auth_headers_user_b)
    assert res_b.status_code == 200
    assert res_b.json() == []


# 7. User B connecting same LinkedIn sub as User A gets 409 and A's row is unchanged
def test_same_linkedin_sub_conflict_returns_409(
    client, db_test_schema, auth_headers_user_a, auth_headers_user_b, monkeypatch
):
    # Connect User A with sub-shared
    start_a = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state_a = parse_qs(urlparse(start_a.json()["authorization_url"]).query)["state"][0]

    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: ("token-shared", 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-shared-001", "Shared Account"),
    )

    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-a", "state": state_a},
    )

    # User B attempts to connect the exact same LinkedIn sub
    start_b = client.post("/connections/linkedin/start", headers=auth_headers_user_b)
    state_b = parse_qs(urlparse(start_b.json()["authorization_url"]).query)["state"][0]

    conflict_res = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_b,
        json={"code": "code-b", "state": state_b},
    )
    assert conflict_res.status_code == 409
    err = conflict_res.json()["error"]
    assert err["code"] == "account_already_connected"
    assert "already connected" in err["message"]

    # Verify User A's row remains intact and owned by User A
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT user_id, provider_account_id FROM social_connections WHERE provider_account_id = 'sub-shared-001'")
        ).fetchone()
        assert row is not None
        assert row[0] == "user-a-111"


# 8. DELETE removes only caller's row and succeeds even if LinkedIn revoke fails
def test_delete_connection_removes_caller_row_and_handles_revoke_failure(
    client, db_test_schema, auth_headers_user_a, auth_headers_user_b, monkeypatch
):
    # Connect both User A and User B
    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: ("token", 5184000),
    )

    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-1", "User A"),
    )
    start_a = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state_a = parse_qs(urlparse(start_a.json()["authorization_url"]).query)["state"][0]
    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-1", "state": state_a},
    )

    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-2", "User B"),
    )
    start_b = client.post("/connections/linkedin/start", headers=auth_headers_user_b)
    state_b = parse_qs(urlparse(start_b.json()["authorization_url"]).query)["state"][0]
    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_b,
        json={"code": "code-2", "state": state_b},
    )

    # Mock revoke to raise an exception simulating network or server outage
    def failing_revoke(token: str):
        raise RuntimeError("LinkedIn service unavailable")

    monkeypatch.setattr(linkedin_service, "revoke_token_best_effort", failing_revoke)

    # User A disconnects
    del_res = client.delete("/connections/linkedin", headers=auth_headers_user_a)
    assert del_res.status_code == 204

    # Verify User A's connection is deleted
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row_a = db.execute(
            text("SELECT 1 FROM social_connections WHERE user_id = 'user-a-111'")
        ).fetchone()
        assert row_a is None

        # Verify User B's connection remains intact
        row_b = db.execute(
            text("SELECT 1 FROM social_connections WHERE user_id = 'user-b-222'")
        ).fetchone()
        assert row_b is not None

    # Deleting when nothing is connected also returns 204
    del_again = client.delete("/connections/linkedin", headers=auth_headers_user_a)
    assert del_again.status_code == 204


# 9. An expired expires_at automatically updates status to expired and returns 0 days_left
def test_expired_connection_shows_expired_status(
    client, db_test_schema, auth_headers_user_a, monkeypatch
):
    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: ("token", 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-exp", "Expiring User"),
    )

    client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "code-exp", "state": state},
    )

    # Artificially set expires_at in the past
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        db.execute(
            text("UPDATE social_connections SET expires_at = now() - interval '2 days' WHERE user_id = 'user-a-111'")
        )
        db.commit()

    # GET /connections should reflect expired status and save it
    get_res = client.get("/connections", headers=auth_headers_user_a)
    assert get_res.status_code == 200
    data = get_res.json()
    assert len(data) == 1
    assert data[0]["status"] == "expired"
    assert data[0]["days_left"] == 0

    # Verify status was persisted in the database
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT status FROM social_connections WHERE user_id = 'user-a-111'")
        ).fetchone()
        assert row is not None
        assert row[0] == "expired"


# 10. All new routes return 401 without an Authorization token
def test_all_connections_routes_require_authentication(client):
    res_list = client.get("/connections")
    assert res_list.status_code == 401

    res_start = client.post("/connections/linkedin/start")
    assert res_start.status_code == 401

    res_cb = client.post("/connections/linkedin/callback", json={"code": "c", "state": "s"})
    assert res_cb.status_code == 401

    res_del = client.delete("/connections/linkedin")
    assert res_del.status_code == 401


# 11. No log lines or responses contain secret access token, code, or client secret
def test_no_sensitive_secrets_leaked_in_logs_or_responses(
    client, db_test_schema, auth_headers_user_a, caplog, monkeypatch
):
    import logging
    caplog.set_level(logging.DEBUG)

    sensitive_token = "TOP_SECRET_LINKEDIN_TOKEN_999"
    sensitive_code = "SECRET_AUTH_CODE_777"

    start_res = client.post("/connections/linkedin/start", headers=auth_headers_user_a)
    state = parse_qs(urlparse(start_res.json()["authorization_url"]).query)["state"][0]

    monkeypatch.setattr(
        linkedin_service,
        "exchange_code_for_token",
        lambda code: (sensitive_token, 5184000),
    )
    monkeypatch.setattr(
        linkedin_service,
        "fetch_user_info",
        lambda token: ("sub-clean", "Clean Logs Member"),
    )

    cb_res = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": sensitive_code, "state": state},
    )
    assert cb_res.status_code == 200

    # Check response text
    assert sensitive_token not in cb_res.text
    assert sensitive_code not in cb_res.text
    assert settings.LINKEDIN_CLIENT_SECRET not in cb_res.text
    assert settings.TOKEN_ENCRYPTION_KEY not in cb_res.text

    # Check all captured log records
    full_logs = "\n".join(record.getMessage() for record in caplog.records)
    assert sensitive_token not in full_logs
    assert sensitive_code not in full_logs
    assert settings.LINKEDIN_CLIENT_SECRET not in full_logs
    assert settings.TOKEN_ENCRYPTION_KEY not in full_logs


# 12. Extra fields forbidden on callback payload
def test_extra_fields_forbidden_on_callback(client, db_test_schema, auth_headers_user_a):
    res = client.post(
        "/connections/linkedin/callback",
        headers=auth_headers_user_a,
        json={"code": "c", "state": "s", "extra_field": "hacker"},
    )
    assert res.status_code == 422
