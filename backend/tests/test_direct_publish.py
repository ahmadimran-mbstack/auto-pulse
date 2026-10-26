import datetime
import io
import json
from unittest.mock import MagicMock
import httpx
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.models.social_connection import SocialConnection
from app.services import linkedin as linkedin_service
from app.services import linkedin_publisher
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


# Helper to seed a social connection for a user
def seed_connection(
    db,
    user_id: str,
    provider_account_id: str = "member-sub-123",
    account_name: str = "Student Engineer",
    access_token: str = "valid_access_token_abc",
    refresh_token: str = None,
    expires_delta_seconds: int = 5184000,
    status: str = "active",
) -> SocialConnection:
    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(seconds=expires_delta_seconds)

    conn = SocialConnection(
        user_id=user_id,
        provider="linkedin",
        provider_account_id=provider_account_id,
        account_name=account_name,
        access_token_enc=encrypt_text(access_token),
        refresh_token_enc=encrypt_text(refresh_token) if refresh_token else None,
        expires_at=expires_at,
        scopes=["openid", "profile", "w_member_social"],
        status=status,
    )
    db.add(conn)
    db.commit()
    db.refresh(conn)
    return conn


# 1. Happy path text only: publishes immediately with correct LinkedIn Posts payload
def test_happy_path_text_only(client, db_test_schema, auth_headers_user_a, monkeypatch):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        seed_connection(db, user_id="user-a-111", provider_account_id="person-001")

    captured_requests = []

    def mock_post(self, url, *args, **kwargs):
        captured_requests.append({"url": str(url), "kwargs": kwargs})
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 201
        mock_resp.headers = {"x-restli-id": "urn:li:share:123456789"}
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", mock_post)

    response = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={
            "content": "Excited to launch our new product today! #innovation",
            "visibility": "PUBLIC",
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "urn:li:share:123456789"
    assert data["linkedin_post_id"] == "urn:li:share:123456789"
    assert data["visibility"] == "PUBLIC"
    assert "posted_at" in data

    # Verify LinkedIn Posts API payload
    assert len(captured_requests) == 1
    req = captured_requests[0]
    assert req["url"] == "https://api.linkedin.com/rest/posts"
    body = req["kwargs"]["json"]
    assert body["author"] == "urn:li:person:person-001"
    assert body["visibility"] == "PUBLIC"
    assert body["commentary"] == "Excited to launch our new product today! #innovation"
    assert "content" not in body


# 2. Happy path with image: runs initializeUpload, PUT binary, and creates post with media
def test_happy_path_with_image(client, db_test_schema, auth_headers_user_a, monkeypatch):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        seed_connection(db, user_id="user-a-111", provider_account_id="person-002")

    init_called = []
    put_called = []
    post_called = []

    def mock_post(self, url, *args, **kwargs):
        url_str = str(url)
        if "action=initializeUpload" in url_str:
            init_called.append(kwargs)
            res = MagicMock(spec=httpx.Response)
            res.status_code = 200
            res.json.return_value = {
                "value": {
                    "uploadUrl": "https://upload.linkedin.com/binary-asset-url",
                    "image": "urn:li:image:asset-999",
                }
            }
            return res
        elif "api.linkedin.com/rest/posts" in url_str:
            post_called.append(kwargs)
            res = MagicMock(spec=httpx.Response)
            res.status_code = 201
            res.headers = {"x-restli-id": "urn:li:share:media-post-888"}
            return res
        return MagicMock(status_code=404)

    def mock_put(self, url, *args, **kwargs):
        put_called.append({"url": str(url), "kwargs": kwargs})
        res = MagicMock(spec=httpx.Response)
        res.status_code = 201
        return res

    monkeypatch.setattr(httpx.Client, "post", mock_post)
    monkeypatch.setattr(httpx.Client, "put", mock_put)

    image_content = b"\x89PNG\r\n\x1a\nfake_png_data"
    response = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={
            "content": "<p>Check out our <b>latest analytics</b> chart!</p>",
            "visibility": "CONNECTIONS",
        },
        files={"image": ("chart.png", image_content, "image/png")},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "urn:li:share:media-post-888"
    assert data["linkedin_post_id"] == "urn:li:share:media-post-888"
    assert data["visibility"] == "CONNECTIONS"

    # Verify initializeUpload was called
    assert len(init_called) == 1
    assert init_called[0]["json"]["initializeUploadRequest"]["owner"] == "urn:li:person:person-002"

    # Verify binary PUT upload
    assert len(put_called) == 1
    assert put_called[0]["url"] == "https://upload.linkedin.com/binary-asset-url"
    assert put_called[0]["kwargs"]["content"] == image_content
    assert put_called[0]["kwargs"]["headers"]["Content-Type"] == "image/png"

    # Verify post creation with media attachment and Unicode bold formatting
    assert len(post_called) == 1
    post_body = post_called[0]["json"]
    assert post_body["visibility"] == "CONNECTIONS"
    assert post_body["content"]["media"]["id"] == "urn:li:image:asset-999"
    # Bold text was converted to Unicode bold
    assert "latest analytics" not in post_body["commentary"]
    assert "\U0001d425\U0001d41a\U0001d42d\U0001d41e\U0001d42c\U0001d42d" in post_body["commentary"]


# 3. 409 LINKEDIN_NOT_CONNECTED when user has no connection row
def test_409_when_no_connection(client, db_test_schema, auth_headers_user_a):
    response = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={
            "content": "Valid post content here",
            "visibility": "PUBLIC",
        },
    )
    assert response.status_code == 409
    data = response.json()
    error_code = data["error"] if isinstance(data["error"], str) else data["error"]["code"]
    assert error_code == "LINKEDIN_NOT_CONNECTED"


# 4. 409 LINKEDIN_RECONNECT_REQUIRED when token refresh fails
def test_409_when_refresh_fails(client, db_test_schema, auth_headers_user_a, monkeypatch):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        # Seed connection near expiry (expires in 60 seconds) with a refresh token
        seed_connection(
            db,
            user_id="user-a-111",
            refresh_token="my_refresh_token_xyz",
            expires_delta_seconds=60,
        )

    # Mock refresh_access_token to simulate LinkedIn rejection (e.g. revoked refresh token)
    def failing_refresh(refresh_token: str):
        raise linkedin_service.LinkedInRejectedError()

    monkeypatch.setattr(linkedin_service, "refresh_access_token", failing_refresh)

    response = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={
            "content": "Valid content to post",
            "visibility": "PUBLIC",
        },
    )

    assert response.status_code == 409
    data = response.json()
    error_code = data["error"] if isinstance(data["error"], str) else data["error"]["code"]
    assert error_code == "LINKEDIN_RECONNECT_REQUIRED"

    # Verify status in database transitioned to expired
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT status FROM social_connections WHERE user_id = 'user-a-111'")
        ).fetchone()
        assert row is not None
        assert row[0] == "expired"


# 5. 400 Validation errors
def test_400_validation_errors(client, db_test_schema, auth_headers_user_a):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        seed_connection(db, user_id="user-a-111")

    # A. Empty content
    res_empty = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={"content": "   ", "visibility": "PUBLIC"},
    )
    assert res_empty.status_code == 400

    # B. Content > 3000 characters
    long_content = "x" * 3005
    res_long = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={"content": long_content, "visibility": "PUBLIC"},
    )
    assert res_long.status_code == 400

    # C. Invalid visibility
    res_vis = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={"content": "Valid text", "visibility": "EVERYONE"},
    )
    assert res_vis.status_code == 400

    # D. Oversized image (> 5 MB)
    large_image = b"0" * (5 * 1024 * 1024 + 100)
    res_large = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={"content": "Valid text", "visibility": "PUBLIC"},
        files={"image": ("large.png", large_image, "image/png")},
    )
    assert res_large.status_code == 400

    # E. Invalid MIME type
    res_mime = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={"content": "Valid text", "visibility": "PUBLIC"},
        files={"image": ("doc.pdf", b"%PDF-fake", "application/pdf")},
    )
    assert res_mime.status_code == 400


# 6. Caller isolation: User B never uses User A's connection
def test_caller_isolation_user_b_cannot_use_user_a_connection(
    client, db_test_schema, auth_headers_user_a, auth_headers_user_b
):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        # Only User A has a connection
        seed_connection(db, user_id="user-a-111", provider_account_id="person-alpha")

    # User B calls post endpoint
    res_b = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_b,
        data={"content": "User B trying to post", "visibility": "PUBLIC"},
    )
    assert res_b.status_code == 409
    data = res_b.json()
    error_code = data["error"] if isinstance(data["error"], str) else data["error"]["code"]
    assert error_code == "LINKEDIN_NOT_CONNECTED"

    # User A's connection status remains untouched
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        row = db.execute(
            text("SELECT status FROM social_connections WHERE user_id = 'user-a-111'")
        ).fetchone()
        assert row is not None
        assert row[0] == "active"


# 7. GET /api/linkedin/status returns connection details
def test_get_linkedin_status(client, db_test_schema, auth_headers_user_a, auth_headers_user_b):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        seed_connection(db, user_id="user-a-111", account_name="Morgan Stanley")

    # User A is connected
    res_a = client.get("/api/linkedin/status", headers=auth_headers_user_a)
    assert res_a.status_code == 200
    data_a = res_a.json()
    assert data_a["connected"] is True
    assert data_a["account_name"] == "Morgan Stanley"
    assert data_a["expires_at"] is not None

    # User B is not connected
    res_b = client.get("/api/linkedin/status", headers=auth_headers_user_b)
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["connected"] is False
    assert data_b["account_name"] is None
    assert data_b["expires_at"] is None


# 8. 502 LINKEDIN_API_ERROR when LinkedIn API returns a downstream server error
def test_502_when_linkedin_api_fails(
    client, db_test_schema, auth_headers_user_a, monkeypatch
):
    SessionLocal = db_test_schema["SessionLocal"]
    schema = db_test_schema["schema_name"]
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema}"'))
        seed_connection(db, user_id="user-a-111")

    def mock_failing_post(self, url, *args, **kwargs):
        mock_resp = MagicMock(spec=httpx.Response)
        mock_resp.status_code = 500
        mock_resp.text = "Internal LinkedIn Server Error"
        return mock_resp

    monkeypatch.setattr(httpx.Client, "post", mock_failing_post)

    response = client.post(
        "/api/linkedin/post",
        headers=auth_headers_user_a,
        data={
            "content": "Valid post content",
            "visibility": "PUBLIC",
        },
    )
    assert response.status_code == 502
    data = response.json()
    error_code = data["error"] if isinstance(data["error"], str) else data["error"]["code"]
    assert error_code == "LINKEDIN_API_ERROR"


# 9. 401 when request is not authenticated
def test_401_when_unauthenticated(client):
    res_post = client.post("/api/linkedin/post", data={"content": "test", "visibility": "PUBLIC"})
    assert res_post.status_code == 401

    res_status = client.get("/api/linkedin/status")
    assert res_status.status_code == 401
