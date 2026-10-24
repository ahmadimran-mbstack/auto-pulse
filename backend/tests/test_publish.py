import datetime
from typing import List, Optional
from unittest.mock import MagicMock, patch
import uuid
import httpx
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.core.crypto import encrypt_text
from app.jobs.publish import claim_publication, fail_stuck_publications, run_publisher
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.social_connection import SocialConnection
from app.services.linkedin_publisher import escape_little_text, publish_post_to_linkedin
from tests.conftest import create_test_token


# Table-driven test for little text format escaping
@pytest.mark.parametrize(
    "raw_input,expected_output",
    [
        ("Simple text", "Simple text"),
        ("Backslash \\ path", "Backslash \\\\ path"),
        ("Pipe | symbol", "Pipe \\| symbol"),
        ("Braces {like this}", "Braces \\{like this\\}"),
        ("Mention @user here", "Mention \\@user here"),
        ("Brackets [tag] here", "Brackets \\[tag\\] here"),
        ("Parentheses (note)", "Parentheses \\(note\\)"),
        ("Angles <script>", "Angles \\<script\\>"),
        ("Hash #hashtag", "Hash \\#hashtag"),
        ("Asterisk *bullet*", "Asterisk \\*bullet\\*"),
        ("Underscore _italic_", "Underscore \\_italic\\_"),
        ("Tilde ~strike~", "Tilde \\~strike\\~"),
        (
            "Combo: @[user](urn:li:person:1) {test|#|tag} *bold* _ital_ ~strike~ <xml> | \\",
            "Combo: \\@\\[user\\]\\(urn:li:person:1\\) \\{test\\|\\#\\|tag\\} \\*bold\\* \\_ital\\_ \\~strike\\~ \\<xml\\> \\| \\\\",
        ),
    ],
)
def test_escape_little_text_table(raw_input, expected_output):
    assert escape_little_text(raw_input) == expected_output


# Helper to seed post and publication
def _seed_post_and_pub(
    db,
    user_id: str = "user-pub-1",
    post_status: str = "approved",
    pub_status: str = "pending",
    publish_at: Optional[datetime.datetime] = None,
    not_before: Optional[datetime.datetime] = None,
    claimed_at: Optional[datetime.datetime] = None,
    attempts: int = 0,
    error_code: Optional[str] = None,
):
    if not publish_at:
        publish_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)

    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=datetime.date(2026, 10, 24),
        status=post_status,
        publish_at=publish_at,
        topic_title="Scalable SaaS Architecture",
        topic_url="https://example.com/saas",
        sources=[],
        caption="Modern SaaS requires decoupled jobs and idempotent publishers.",
        hashtags=["#SaaS", "#Cloud"],
        image_spec={"headline": "Scalable SaaS Architecture"},
        llm_model="test",
        prompt_version="v1",
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    pub = PostPublication(
        id=uuid.uuid4(),
        user_id=user_id,
        post_id=post.id,
        platform="linkedin",
        status=pub_status,
        attempts=attempts,
        not_before=not_before,
        claimed_at=claimed_at,
        error_code=error_code,
    )
    db.add(pub)
    db.commit()
    db.refresh(pub)
    return post, pub


# Helper to seed active social connection
def _seed_active_connection(db, user_id: str = "user-pub-1"):
    conn = SocialConnection(
        id=uuid.uuid4(),
        user_id=user_id,
        provider="linkedin",
        provider_account_id="urn_member_12345",
        account_name="Publisher Member",
        access_token_enc=encrypt_text("test_linkedin_access_token_999"),
        expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30),
        scopes=["w_member_social", "openid", "profile"],
        status="active",
    )
    db.add(conn)
    db.commit()
    return conn


# 1. Happy path makes exactly the three LinkedIn calls with correct headers, saves URN, marks published
def test_publisher_happy_path(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        # Mock httpx responses for the 3 LinkedIn calls
        calls = []

        def custom_handler(request: httpx.Request):
            calls.append(request)
            url_str = str(request.url)

            # Step 1: initializeUpload
            if "initializeUpload" in url_str:
                assert request.headers["Linkedin-Version"] == settings.LINKEDIN_API_VERSION
                assert request.headers["X-Restli-Protocol-Version"] == "2.0.0"
                assert "Bearer test_linkedin_access_token_999" in request.headers["Authorization"]
                return httpx.Response(
                    200,
                    json={
                        "value": {
                            "uploadUrl": "https://upload.linkedin.com/image-binary/upload-123",
                            "image": "urn:li:image:uploaded-asset-456",
                        }
                    },
                )

            # Step 2: PUT binary bytes to uploadUrl
            if "upload-123" in url_str:
                assert request.method == "PUT"
                assert request.headers["Content-Type"] == "image/png"
                return httpx.Response(201)

            # Step 3: create post
            if "/rest/posts" in url_str:
                assert request.headers["Linkedin-Version"] == settings.LINKEDIN_API_VERSION
                assert request.headers["X-Restli-Protocol-Version"] == "2.0.0"
                return httpx.Response(
                    201,
                    headers={"x-restli-id": "urn:li:share:new-post-789"},
                )

            return httpx.Response(404)

        transport = httpx.MockTransport(custom_handler)
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        # Verify exactly 3 LinkedIn calls made
        assert len(calls) == 3

        # Verify publication and post are published in database
        db.refresh(pub)
        db.refresh(post)
        assert pub.status == "published"
        assert pub.external_id == "urn:li:share:new-post-789"
        assert pub.published_at is not None
        assert post.status == "published"


# 2. Running publisher twice calls LinkedIn only once (atomic claim)
def test_publisher_atomic_claim_runs_once(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        call_count = 0

        def custom_handler(request: httpx.Request):
            nonlocal call_count
            call_count += 1
            if "initializeUpload" in str(request.url):
                return httpx.Response(200, json={"value": {"uploadUrl": "https://u.com", "image": "urn:li:image:1"}})
            if "u.com" in str(request.url):
                return httpx.Response(200)
            if "/rest/posts" in str(request.url):
                return httpx.Response(201, headers={"x-restli-id": "urn:li:share:123"})
            return httpx.Response(404)

        transport = httpx.MockTransport(custom_handler)
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            # First run processes the post
            run_publisher(db)
            assert call_count == 3

            # Second run finds no pending publications
            run_publisher(db)
            assert call_count == 3


# 3. HTTP 401 gives token_invalid and marks connection expired
def test_publisher_handles_401_token_invalid(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        conn = _seed_active_connection(db, post.user_id)

        transport = httpx.MockTransport(lambda req: httpx.Response(401, json={"message": "Unauthorized token"}))
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        db.refresh(pub)
        db.refresh(post)
        db.refresh(conn)

        assert pub.status == "failed"
        assert pub.error_code == "token_invalid"
        assert post.status == "failed"
        assert conn.status == "expired"


# 4. HTTP 429 returns publication to pending with not_before and stops after 3 attempts
def test_publisher_handles_429_rate_limited_retry(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        transport = httpx.MockTransport(lambda req: httpx.Response(429, json={"message": "Rate limited"}))
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            # Attempt 1: goes back to pending with not_before
            run_publisher(db)
            db.refresh(pub)
            assert pub.status == "pending"
            assert pub.attempts == 1
            assert pub.not_before is not None
            assert pub.error_code == "rate_limited"

            # Reset not_before so attempt 2 can run
            pub.not_before = None
            db.commit()

            # Attempt 2: still pending
            run_publisher(db)
            db.refresh(pub)
            assert pub.status == "pending"
            assert pub.attempts == 2

            # Reset not_before so attempt 3 can run
            pub.not_before = None
            db.commit()

            # Attempt 3: reaches max attempts (3) and becomes failed
            run_publisher(db)
            db.refresh(pub)
            assert pub.status == "failed"
            assert pub.attempts == 3


# 5. Timeout on create-post request gives outcome_unknown with NO retry
def test_publisher_timeout_gives_outcome_unknown_no_retry(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        def custom_handler(req: httpx.Request):
            if "initializeUpload" in str(req.url):
                return httpx.Response(200, json={"value": {"uploadUrl": "https://u.com", "image": "urn:li:image:1"}})
            if "u.com" in str(req.url):
                return httpx.Response(200)
            if "/rest/posts" in str(req.url):
                raise httpx.ReadTimeout("Connection dropped while awaiting post creation")
            return httpx.Response(404)

        transport = httpx.MockTransport(custom_handler)
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        db.refresh(pub)
        db.refresh(post)
        assert pub.status == "failed"
        assert pub.error_code == "outcome_unknown"
        assert post.status == "failed"


# 6. HTTP 500 on image upload gives step_failed and safe retry
def test_publisher_image_upload_500_gives_step_failed_retry(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        def custom_handler(req: httpx.Request):
            if "initializeUpload" in str(req.url):
                return httpx.Response(200, json={"value": {"uploadUrl": "https://u.com", "image": "urn:li:image:1"}})
            if "u.com" in str(req.url):
                return httpx.Response(500, text="Internal Server Error")
            return httpx.Response(404)

        transport = httpx.MockTransport(custom_handler)
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        db.refresh(pub)
        assert pub.status == "pending"
        assert pub.error_code == "step_failed"
        assert pub.not_before is not None


# 7. Stuck publishing row (> 10 mins) becomes outcome_unknown
def test_stuck_publishing_becomes_outcome_unknown(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        stuck_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=15)
        post, pub = _seed_post_and_pub(
            db,
            post_status="publishing",
            pub_status="publishing",
            claimed_at=stuck_time,
        )

        fail_stuck_publications(db)

        db.refresh(pub)
        db.refresh(post)
        assert pub.status == "failed"
        assert pub.error_code == "outcome_unknown"
        assert post.status == "failed"


# 8. Missing connection makes NO HTTP call
def test_connection_inactive_makes_no_http_call(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # No connection created for user
        post, pub = _seed_post_and_pub(db)

        calls = []
        transport = httpx.MockTransport(lambda req: calls.append(req) or httpx.Response(200))
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        assert len(calls) == 0
        db.refresh(pub)
        assert pub.status == "failed"
        assert pub.error_code == "connection_inactive"


# 9. PUBLISH_ENABLED false makes NO HTTP call
def test_publish_enabled_false_makes_no_call(db_test_schema, monkeypatch):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(db)
        _seed_active_connection(db, post.user_id)

        monkeypatch.setattr(settings, "PUBLISH_ENABLED", False)

        calls = []
        transport = httpx.MockTransport(lambda req: calls.append(req) or httpx.Response(200))
        client = httpx.Client(transport=transport)

        with patch("app.services.linkedin_publisher.httpx.Client", return_value=client):
            run_publisher(db)

        assert len(calls) == 0


# 10. Retry route demands confirm_not_posted for outcome_unknown
def test_retry_route_demands_confirmation_for_outcome_unknown(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    token = create_test_token(private_key, sub="user-retry-1")
    headers = {"Authorization": f"Bearer {token}"}

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post, pub = _seed_post_and_pub(
            db,
            user_id="user-retry-1",
            post_status="failed",
            pub_status="failed",
            error_code="outcome_unknown",
        )
        post_id = post.id
        pub_id = pub.id

    # Calling retry with confirm_not_posted=False must return 400 confirmation_required
    r1 = client.post(
        f"/posts/{post_id}/publications/linkedin/retry",
        headers=headers,
        json={"confirm_not_posted": False},
    )
    assert r1.status_code == 400
    assert r1.json()["error"]["code"] == "confirmation_required"

    # Calling retry with confirm_not_posted=True succeeds and sets publication to pending
    r2 = client.post(
        f"/posts/{post_id}/publications/linkedin/retry",
        headers=headers,
        json={"confirm_not_posted": True},
    )
    assert r2.status_code == 200

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        saved_pub = db.query(PostPublication).filter(PostPublication.id == pub_id).first()
        saved_post = db.query(Post).filter(Post.id == post_id).first()
        assert saved_pub.status == "pending"
        assert saved_pub.not_before is None
        assert saved_post.status == "approved"
