import datetime
import hashlib
import re
from unittest.mock import MagicMock, patch
import uuid
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.main import sanitize_log_path
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.services.approval import decide_approval, request_approval
from tests.conftest import create_test_token


# Helper to get auth headers for a given sub
def _auth_headers(private_key, sub: str = "user-123", name: str = "Test User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


# Helper to seed a valid post in the database
def _seed_sample_post(
    db,
    user_id: str,
    status: str = "draft",
    publish_at: datetime.datetime = None,
) -> Post:
    if not publish_at:
        publish_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2)

    post = Post(
        id=uuid.uuid4(),
        user_id=user_id,
        run_date=datetime.date(2026, 10, 21),
        status=status,
        publish_at=publish_at,
        topic_title="AI Architecture in Production",
        topic_url="https://example.com/ai-arch",
        sources=[{"title": "AI Trends", "url": "https://example.com/ai"}],
        caption="Exploring AI architectures for scalable data processing.",
        hashtags=["#ai", "#architecture"],
        image_spec={
            "headline": "AI Architecture in Production",
            "brand_name": "AutoPulse",
            "brand_primary_hex": "#0F172A",
            "brand_accent_hex": "#38BDF8",
            "template_version": "v1",
        },
        llm_model="test-llm",
        prompt_version="v1",
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return post


# Test: The database holds only the SHA-256 hash and never the raw token
def test_database_holds_only_hash(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_sample_post(db, "user-123")

        with patch("app.services.approval.send_approval_email") as mock_send:
            success = request_approval(db, post, recipient_email="user@example.com")
            assert success is True
            assert mock_send.called

            raw_token = mock_send.call_args.kwargs["raw_token"]
            assert len(raw_token) > 20

            approval = db.query(Approval).filter(Approval.post_id == post.id).first()
            assert approval is not None
            assert approval.token_hash != raw_token
            expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
            assert approval.token_hash == expected_hash


# Test: Public route GET twice leaves the state pending and returns expected headers
def test_public_get_twice_leaves_state_pending(client, db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_sample_post(db, "user-123")
        expected_caption = post.caption
        expected_topic = post.topic_title

        with patch("app.services.approval.send_approval_email") as mock_send:
            request_approval(db, post, recipient_email="user@example.com")
            raw_token = mock_send.call_args.kwargs["raw_token"]

    # First GET
    r1 = client.get(f"/public/approvals/{raw_token}")
    assert r1.status_code == 200
    data1 = r1.json()
    assert data1["state"] == "pending"
    assert data1["caption"] == expected_caption
    assert data1["topic_title"] == expected_topic
    assert r1.headers.get("cache-control") == "no-store"
    assert r1.headers.get("referrer-policy") == "no-referrer"
    assert r1.headers.get("x-robots-tag") == "noindex"

    # Second GET: state remains pending
    r2 = client.get(f"/public/approvals/{raw_token}")
    assert r2.status_code == 200
    assert r2.json()["state"] == "pending"


# Test: Public route returns 404 for an unknown token
def test_public_route_unknown_token_returns_404(client, db_test_schema):
    r = client.get("/public/approvals/nonexistent-token-12345")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


# Test: Public route returns 410 for an expired token
def test_public_route_expired_token_returns_410(client, db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    raw_token = "expired-token-val"
    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        expired_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)
        post = _seed_sample_post(db, "user-123", publish_at=expired_time)

        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        approval = Approval(
            user_id="user-123",
            post_id=post.id,
            channel="email",
            token_hash=token_hash,
            expires_at=expired_time,
            sent_at=expired_time - datetime.timedelta(hours=1),
        )
        db.add(approval)
        db.commit()

    # GET returns state='expired'
    r_get = client.get(f"/public/approvals/{raw_token}")
    assert r_get.status_code == 200
    assert r_get.json()["state"] == "expired"

    # POST decision returns 410
    r_post = client.post(f"/public/approvals/{raw_token}/decision", json={"decision": "approved"})
    assert r_post.status_code == 410
    assert r_post.json()["error"]["code"] == "expired"


# Test: Decision claim run twice for the same token wins only once
def test_decision_claim_race_wins_only_once(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    raw_token = "test-token-racing"
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_sample_post(db, "user-123", status="awaiting_approval")

        approval = Approval(
            user_id="user-123",
            post_id=post.id,
            channel="email",
            token_hash=token_hash,
            expires_at=post.publish_at,
            sent_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(approval)
        db.commit()

        # First claim succeeds
        res1 = decide_approval(db, decision="approved", decided_via="email_link", token_hash=token_hash)
        assert res1["status"] == "ok"

        # Second claim fails with 409 already_decided
        with pytest.raises(Exception) as exc_info:
            decide_approval(db, decision="approved", decided_via="email_link", token_hash=token_hash)
        assert exc_info.value.status_code == 409
        assert exc_info.value.detail["code"] == "already_decided"
        assert exc_info.value.detail["state"] == "approved"


# Test: Approving creates exactly one publication row and moves post to approved; rejecting creates none
def test_decision_effects_approved_vs_rejected(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))

        # 1. Test approved
        post1 = _seed_sample_post(db, "user-1", status="awaiting_approval")
        raw1 = "token-1"
        hash1 = hashlib.sha256(raw1.encode("utf-8")).hexdigest()
        app1 = Approval(
            user_id="user-1",
            post_id=post1.id,
            channel="email",
            token_hash=hash1,
            expires_at=post1.publish_at,
            sent_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(app1)
        db.commit()

        decide_approval(db, decision="approved", decided_via="email_link", token_hash=hash1)
        db.refresh(post1)
        assert post1.status == "approved"
        pubs = db.query(PostPublication).filter(PostPublication.post_id == post1.id).all()
        assert len(pubs) == 1
        assert pubs[0].platform == "linkedin"
        assert pubs[0].status == "pending"

        # 2. Test rejected
        post2 = _seed_sample_post(db, "user-2", status="awaiting_approval")
        raw2 = "token-2"
        hash2 = hashlib.sha256(raw2.encode("utf-8")).hexdigest()
        app2 = Approval(
            user_id="user-2",
            post_id=post2.id,
            channel="email",
            token_hash=hash2,
            expires_at=post2.publish_at,
            sent_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(app2)
        db.commit()

        decide_approval(db, decision="rejected", decided_via="email_link", token_hash=hash2)
        db.refresh(post2)
        assert post2.status == "rejected"
        pubs2 = db.query(PostPublication).filter(PostPublication.post_id == post2.id).all()
        assert len(pubs2) == 0


# Test: Rotated token invalidates the old one
def test_rotated_token_invalidates_old(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_sample_post(db, "user-123")

        # First attempt fails
        with patch("app.services.approval.send_approval_email", side_effect=Exception("SMTP connect error")):
            s1 = request_approval(db, post, recipient_email="user@example.com")
            assert s1 is False

        approval1 = db.query(Approval).filter(Approval.post_id == post.id).first()
        old_hash = approval1.token_hash
        assert approval1.send_attempts == 1

        # Second attempt succeeds and rotates token
        with patch("app.services.approval.send_approval_email") as mock_send:
            s2 = request_approval(db, post, recipient_email="user@example.com")
            assert s2 is True
            new_token = mock_send.call_args.kwargs["raw_token"]
            new_hash = hashlib.sha256(new_token.encode("utf-8")).hexdigest()

        db.refresh(approval1)
        assert approval1.token_hash == new_hash
        assert approval1.token_hash != old_hash
        assert approval1.sent_at is not None


# Test: Email has exactly one link and points at {APP_BASE_URL}/approve/{token}
def test_email_has_exactly_one_link(db_test_schema):
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post = _seed_sample_post(db, "user-123")

        with patch("app.services.email.send_smtp_message") as mock_smtp:
            request_approval(db, post, recipient_email="user@example.com")
            assert mock_smtp.called
            msg = mock_smtp.call_args[0][0]

            html_part = None
            plain_part = None
            for part in msg.walk():
                ctype = part.get_content_type()
                if ctype == "text/html":
                    html_part = part.get_content()
                elif ctype == "text/plain":
                    plain_part = part.get_content()

            assert html_part is not None
            assert plain_part is not None

            # Verify HTML contains exactly ONE <a ...> href tag
            links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\']', html_part, re.IGNORECASE)
            assert len(links) == 1
            assert links[0].startswith(settings.APP_BASE_URL.rstrip("/"))
            assert "/approve/" in links[0]


# Test: Logging path sanitization replaces token with [token]
def test_logging_masks_approval_token():
    raw_path1 = "/public/approvals/abc123xyz456"
    assert sanitize_log_path(raw_path1) == "/public/approvals/[token]"

    raw_path2 = "/public/approvals/abc123xyz456/image.png"
    assert sanitize_log_path(raw_path2) == "/public/approvals/[token]/image.png"

    raw_path3 = "/public/approvals/abc123xyz456/decision"
    assert sanitize_log_path(raw_path3) == "/public/approvals/[token]/decision"


# Test: User isolation - user A cannot access or decide user B's post
def test_user_isolation(client, db_test_schema, ed25519_keys):
    private_key, _ = ed25519_keys
    headers_u1 = _auth_headers(private_key, sub="user-alice", name="Alice")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        post_b = _seed_sample_post(db, "user-bob", status="awaiting_approval")

    # Alice tries to GET Bob's post -> 404
    r_get = client.get(f"/posts/{post_b.id}", headers=headers_u1)
    assert r_get.status_code == 404

    # Alice tries to DECIDE Bob's post -> 404
    r_decide = client.post(f"/posts/{post_b.id}/decision", json={"decision": "approved"}, headers=headers_u1)
    assert r_decide.status_code == 404


# Test: Dashboard routes return 401 without auth token
def test_dashboard_routes_unauthorized(client):
    dummy_id = uuid.uuid4()
    r1 = client.get(f"/posts/{dummy_id}")
    assert r1.status_code == 401
    r2 = client.post(f"/posts/{dummy_id}/decision", json={"decision": "approved"})
    assert r2.status_code == 401
