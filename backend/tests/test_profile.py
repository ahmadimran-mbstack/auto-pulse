from sqlalchemy import select, text
from app.models.profile import Profile
from tests.conftest import create_test_token


# Helper to get standard auth headers for a given user sub
def _auth_headers(private_key, sub: str = "user-123", name: str = "Test User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


# Test case: GET /profile for a new user creates a blank row and returns onboarding_step 0
def test_get_profile_new_user_creates_blank_row(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-new", name="Jane Engineer")

    response = client.get("/profile", headers=headers)
    assert response.status_code == 200

    data = response.json()
    assert data["onboarding_step"] == 0
    assert data["onboarding_complete"] is False
    assert data["display_name"] == "Jane Engineer"
    assert "user_id" not in data

    # Verify the row exists directly in the database
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        profile = db.scalars(select(Profile).where(Profile.user_id == "user-new")).first()
        assert profile is not None
        assert profile.user_id == "user-new"
        assert profile.display_name == "Jane Engineer"
        assert profile.onboarding_step == 0


# Test case: Steps can be saved in any order, and onboarding_step never goes down
def test_onboarding_steps_save_and_step_never_goes_down(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-steps", name="Step User")

    # Step 3 saved first: onboarding_step becomes 3
    step3_payload = {
        "brand_name": "PulseBrand",
        "brand_primary_hex": "#112233",
        "brand_accent_hex": "#445566",
    }
    r3 = client.put("/profile/onboarding/3", json=step3_payload, headers=headers)
    assert r3.status_code == 200
    d3 = r3.json()
    assert d3["onboarding_step"] == 3
    assert d3["brand_name"] == "PulseBrand"
    assert d3["brand_primary_hex"] == "#112233"
    assert d3["brand_accent_hex"] == "#445566"

    # Step 1 saved after step 3: onboarding_step remains 3
    step1_payload = {
        "role_title": "CTO",
        "industry": "Software",
        "niche_description": "AI-powered marketing automation for creators",
        "audience": "SaaS Founders",
        "topics_include": ["AI", "Marketing", "ai"],  # duplicate "ai" should be removed
        "topics_avoid": ["Spam"],
    }
    r1 = client.put("/profile/onboarding/1", json=step1_payload, headers=headers)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["onboarding_step"] == 3
    assert d1["role_title"] == "CTO"
    assert d1["niche_description"] == "AI-powered marketing automation for creators"
    assert d1["topics_include"] == ["AI", "Marketing"]
    assert d1["topics_avoid"] == ["Spam"]
    assert d1["brand_name"] == "PulseBrand"

    # Step 2 saved: onboarding_step remains 3
    step2_payload = {
        "tone": "educational",
        "voice_notes": "Clear and direct style",
        "sample_posts": "Here is a high-value engineering post.",
    }
    r2 = client.put("/profile/onboarding/2", json=step2_payload, headers=headers)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["onboarding_step"] == 3
    assert d2["tone"] == "educational"

    # Step 4 saved: onboarding_step advances to 4
    step4_payload = {
        "timezone": "Asia/Karachi",
        "post_time": "09:30",
        "post_days": [0, 2, 4],
        "approval_method": "email",
    }
    r4 = client.put("/profile/onboarding/4", json=step4_payload, headers=headers)
    assert r4.status_code == 200
    d4 = r4.json()
    assert d4["onboarding_step"] == 4
    assert d4["timezone"] == "Asia/Karachi"
    assert d4["post_time"] == "09:30"
    assert d4["post_days"] == [0, 2, 4]
    assert d4["approval_method"] == "email"


# Test case: User A and User B tenant isolation
def test_tenant_isolation_between_users(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_a = _auth_headers(private_key, sub="user-a", name="User A")
    headers_b = _auth_headers(private_key, sub="user-b", name="User B")

    # User A saves niche description
    niche_a = "Autonomous AI agent systems for production engineering"
    r_a = client.put(
        "/profile/onboarding/1",
        json={"niche_description": niche_a},
        headers=headers_a,
    )
    assert r_a.status_code == 200

    # User B calls GET /profile: sees empty profile and none of User A's data
    r_b_get = client.get("/profile", headers=headers_b)
    assert r_b_get.status_code == 200
    data_b = r_b_get.json()
    assert data_b["niche_description"] is None
    assert data_b["onboarding_step"] == 0

    # User B saves a different niche description
    niche_b = "Modern web design systems with accessible components"
    r_b_put = client.put(
        "/profile/onboarding/1",
        json={"niche_description": niche_b},
        headers=headers_b,
    )
    assert r_b_put.status_code == 200
    assert r_b_put.json()["niche_description"] == niche_b

    # Verify both rows directly in PostgreSQL to prove no data cross-leakage
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        row_a = db.scalars(select(Profile).where(Profile.user_id == "user-a")).first()
        row_b = db.scalars(select(Profile).where(Profile.user_id == "user-b")).first()

        assert row_a is not None
        assert row_b is not None
        assert row_a.user_id == "user-a"
        assert row_b.user_id == "user-b"
        assert row_a.niche_description == niche_a
        assert row_b.niche_description == niche_b


# Test case: Sending user_id in any request body returns 422
def test_sending_user_id_in_request_body_returns_422(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-guard")

    # Step 1
    r1 = client.put(
        "/profile/onboarding/1",
        json={"user_id": "hacker-1", "role_title": "Developer"},
        headers=headers,
    )
    assert r1.status_code == 422
    assert r1.json()["error"]["code"] == "validation_error"
    assert "user_id" in r1.json()["error"]["fields"]

    # Step 2
    r2 = client.put(
        "/profile/onboarding/2",
        json={"user_id": "hacker-2", "tone": "direct"},
        headers=headers,
    )
    assert r2.status_code == 422
    assert "user_id" in r2.json()["error"]["fields"]

    # Step 3
    r3 = client.put(
        "/profile/onboarding/3",
        json={"user_id": "hacker-3", "brand_name": "Injected"},
        headers=headers,
    )
    assert r3.status_code == 422
    assert "user_id" in r3.json()["error"]["fields"]

    # Step 4
    r4 = client.put(
        "/profile/onboarding/4",
        json={"user_id": "hacker-4", "timezone": "UTC"},
        headers=headers,
    )
    assert r4.status_code == 422
    assert "user_id" in r4.json()["error"]["fields"]


# Test case: Invalid input returns 422 with field messages
def test_invalid_input_returns_422_with_field_messages(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-invalid")

    # Short niche (fewer than 20 characters)
    r_niche = client.put(
        "/profile/onboarding/1",
        json={"niche_description": "Too short"},
        headers=headers,
    )
    assert r_niche.status_code == 422
    err_niche = r_niche.json()["error"]
    assert err_niche["code"] == "validation_error"
    assert err_niche["fields"]["niche_description"] == "Use at least 20 characters."

    # 11 topics
    eleven_topics = [f"Topic_{i}" for i in range(11)]
    r_topics = client.put(
        "/profile/onboarding/1",
        json={"topics_include": eleven_topics},
        headers=headers,
    )
    assert r_topics.status_code == 422
    assert "topics_include" in r_topics.json()["error"]["fields"]

    # Unknown tone
    r_tone = client.put(
        "/profile/onboarding/2",
        json={"tone": "sarcastic"},
        headers=headers,
    )
    assert r_tone.status_code == 422
    assert "tone" in r_tone.json()["error"]["fields"]

    # Bad hex
    r_hex = client.put(
        "/profile/onboarding/3",
        json={"brand_primary_hex": "blue"},
        headers=headers,
    )
    assert r_hex.status_code == 422
    assert "brand_primary_hex" in r_hex.json()["error"]["fields"]

    # Invalid timezone
    r_tz = client.put(
        "/profile/onboarding/4",
        json={"timezone": "Mars/Phobos"},
        headers=headers,
    )
    assert r_tz.status_code == 422
    assert "timezone" in r_tz.json()["error"]["fields"]

    # post_days with 7 (must be 0 to 6)
    r_days = client.put(
        "/profile/onboarding/4",
        json={"post_days": [0, 7]},
        headers=headers,
    )
    assert r_days.status_code == 422
    assert "post_days" in r_days.json()["error"]["fields"]

    # approval_method whatsapp (currently only email is accepted)
    r_app = client.put(
        "/profile/onboarding/4",
        json={"approval_method": "whatsapp"},
        headers=headers,
    )
    assert r_app.status_code == 422
    assert "approval_method" in r_app.json()["error"]["fields"]


# Test case: Complete with missing fields returns 422 listing them all; complete with everything succeeds
def test_complete_onboarding_lifecycle(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-lifecycle", name="Lifecycle User")

    # Calling complete on an empty profile returns 422 listing all required missing fields
    r_missing = client.post("/profile/onboarding/complete", headers=headers)
    assert r_missing.status_code == 422
    err_missing = r_missing.json()["error"]
    assert err_missing["code"] == "validation_error"

    expected_missing = {
        "niche_description",
        "tone",
        "brand_name",
        "brand_primary_hex",
        "brand_accent_hex",
        "timezone",
        "post_time",
        "post_days",
    }
    assert set(err_missing["fields"].keys()) == expected_missing

    # Set all required fields across the 4 steps
    client.put(
        "/profile/onboarding/1",
        json={"niche_description": "Full stack python and react engineering tutorials"},
        headers=headers,
    )
    client.put(
        "/profile/onboarding/2",
        json={"tone": "inspiring"},
        headers=headers,
    )
    client.put(
        "/profile/onboarding/3",
        json={
            "brand_name": "AutoPulse",
            "brand_primary_hex": "#112233",
            "brand_accent_hex": "#AABBCC",
        },
        headers=headers,
    )
    client.put(
        "/profile/onboarding/4",
        json={
            "timezone": "UTC",
            "post_time": "14:00",
            "post_days": [0, 1, 2],
            "approval_method": "email",
        },
        headers=headers,
    )

    # Now complete succeeds
    r_complete = client.post("/profile/onboarding/complete", headers=headers)
    assert r_complete.status_code == 200
    data_complete = r_complete.json()
    assert data_complete["onboarding_complete"] is True
    first_completed_at = data_complete["onboarding_completed_at"]
    assert first_completed_at is not None

    # Calling complete again changes nothing and preserves original timestamp
    r_repeat = client.post("/profile/onboarding/complete", headers=headers)
    assert r_repeat.status_code == 200
    assert r_repeat.json()["onboarding_completed_at"] == first_completed_at


# Test case: Missing token returns 401 on every new route
def test_missing_token_returns_401_on_every_profile_route(client):
    endpoints = [
        ("GET", "/profile", None),
        ("PUT", "/profile/onboarding/1", {"role_title": "Dev"}),
        ("PUT", "/profile/onboarding/2", {"tone": "direct"}),
        ("PUT", "/profile/onboarding/3", {"brand_name": "Pulse"}),
        ("PUT", "/profile/onboarding/4", {"timezone": "UTC"}),
        ("POST", "/profile/onboarding/complete", None),
    ]

    for method, path, body in endpoints:
        if method == "GET":
            response = client.get(path)
        elif method == "PUT":
            response = client.put(path, json=body)
        elif method == "POST":
            response = client.post(path, json=body)
        else:
            continue

        assert response.status_code == 401, f"Expected 401 for {method} {path}"
        assert response.headers.get("WWW-Authenticate") == "Bearer"
        assert response.json() == {
            "error": {
                "code": "unauthorized",
                "message": "Invalid or missing authentication token",
            }
        }
