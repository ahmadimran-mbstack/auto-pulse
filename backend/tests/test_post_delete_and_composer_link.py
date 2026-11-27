"""Tests for DELETE /posts/{post_id} and playground source_post_id atomic publish."""

import datetime
import hashlib
import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core import auth
from app.db.session import SessionLocal
from app.main import app
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.publication import PostPublication
from app.models.usage import LLMCallLog
from tests.conftest import create_test_token


def test_delete_post_lifecycle_fks_and_permissions(ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    uid_a = f"del-a-{uuid.uuid4()}"
    uid_b = f"del-b-{uuid.uuid4()}"
    token_a = create_test_token(private_key, sub=uid_a, email="a@example.com", name="User A")
    token_b = create_test_token(private_key, sub=uid_b, email="b@example.com", name="User B")
    client = TestClient(app)

    raw_tok = f"tok-{uuid.uuid4()}"
    tok_hash = hashlib.sha256(raw_tok.encode("utf-8")).hexdigest()

    with SessionLocal() as db:
        post_draft = Post(
            user_id=uid_a,
            run_date=datetime.date.today(),
            status="draft",
            topic_title="Draft to delete",
            topic_url="",
            sources=[],
            image_spec={},
            llm_model="test-model",
            prompt_version="v1.0",
            caption="Hello world",
        )
        post_pub = Post(
            user_id=uid_a,
            run_date=datetime.date.today(),
            status="publishing",
            topic_title="Publishing post",
            topic_url="",
            sources=[],
            image_spec={},
            llm_model="test-model",
            prompt_version="v1.0",
            caption="Publishing...",
        )
        db.add_all([post_draft, post_pub])
        db.flush()

        run = GenerationRun(
            user_id=uid_a,
            run_date=datetime.date.today(),
            run_type="manual",
            status="succeeded",
            post_id=post_draft.id,
        )
        db.add(run)
        db.flush()

        usage = LLMCallLog(
            run_id=run.id,
            user_id=uid_a,
            kind="generation",
            model="test-model",
            input_tokens=100,
            output_tokens=50,
            cost_micro_usd=1234,
        )
        appr = Approval(
            post_id=post_draft.id,
            user_id=uid_a,
            token_hash=tok_hash,
            expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2),
        )
        pub = PostPublication(
            user_id=uid_a,
            post_id=post_draft.id,
            platform="linkedin",
            status="failed",
            attempts=1,
            error_code="outcome_unknown",
        )
        db.add_all([usage, appr, pub])
        db.commit()
        draft_id = str(post_draft.id)
        pub_id = str(post_pub.id)
        run_id = run.id
        usage_id = usage.id

    try:
        # 1. Another user cannot delete uid_a's post -> 404
        r_other = client.delete(f"/posts/{draft_id}", headers={"Authorization": f"Bearer {token_b}"})
        assert r_other.status_code == 404

        # 2. Publishing post cannot be deleted -> 409
        r_409 = client.delete(f"/posts/{pub_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert r_409.status_code == 409
        assert "being published right now" in r_409.json()["error"]["message"]

        # 3. Owner deletes draft (even with outcome_unknown publication) -> 200
        r_ok = client.delete(f"/posts/{draft_id}", headers={"Authorization": f"Bearer {token_a}"})
        assert r_ok.status_code == 200
        assert r_ok.json()["deleted"] is True

        # 4. Old approval link returns 404 cleanly
        r_appr = client.get(f"/public/approvals/{raw_tok}")
        assert r_appr.status_code == 404

        # 5. GenerationRun.post_id is NULL and LLMCallLog billing row is preserved
        with SessionLocal() as db:
            assert db.query(Post).filter(Post.id == uuid.UUID(draft_id)).first() is None
            assert db.query(Approval).filter(Approval.post_id == uuid.UUID(draft_id)).first() is None
            assert db.query(PostPublication).filter(PostPublication.post_id == uuid.UUID(draft_id)).first() is None
            r_row = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            assert r_row is not None and r_row.post_id is None
            u_row = db.query(LLMCallLog).filter(LLMCallLog.id == usage_id).first()
            assert u_row is not None and u_row.cost_micro_usd == 1234
    finally:
        with SessionLocal() as db:
            db.query(LLMCallLog).filter(LLMCallLog.user_id == uid_a).delete(synchronize_session=False)
            db.query(GenerationRun).filter(GenerationRun.user_id == uid_a).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id == uid_a).delete(synchronize_session=False)
            db.commit()


def test_playground_publish_marks_source_post_published_atomically(ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    uid_a = f"comp-a-{uuid.uuid4()}"
    uid_b = f"comp-b-{uuid.uuid4()}"
    token_a = create_test_token(private_key, sub=uid_a, email="ca@example.com", name="Comp A")
    client = TestClient(app)

    with SessionLocal() as db:
        draft_a = Post(
            user_id=uid_a,
            run_date=datetime.date.today(),
            status="draft",
            topic_title="Source Draft",
            topic_url="",
            sources=[],
            image_spec={},
            llm_model="test-model",
            prompt_version="v1.0",
            caption="Draft text",
        )
        draft_b = Post(
            user_id=uid_b,
            run_date=datetime.date.today(),
            status="draft",
            topic_title="Other User Draft",
            topic_url="",
            sources=[],
            image_spec={},
            llm_model="test-model",
            prompt_version="v1.0",
            caption="Other text",
        )
        db.add_all([draft_a, draft_b])
        db.commit()
        draft_a_id = str(draft_a.id)
        draft_b_id = str(draft_b.id)

    try:
        class _FakeConn:
            provider_account_id = "li-acc-1"

        # 1. Another user's source_post_id -> 404
        r_other = client.post(
            "/api/linkedin/post",
            headers={"Authorization": f"Bearer {token_a}"},
            data={"content": "Hello", "visibility": "PUBLIC", "source_post_id": draft_b_id},
        )
        assert r_other.status_code == 404

        # 2. Failed LinkedIn publish leaves draft_a as 'draft'
        from app.services.linkedin_publisher import LinkedInApiError
        with patch("app.repositories.connection.get_valid_linkedin_connection_token", return_value=("tok", _FakeConn())), \
             patch("app.services.linkedin_publisher.publish_direct_post", side_effect=LinkedInApiError("LinkedIn 500", status_code=500)):
            r_fail = client.post(
                "/api/linkedin/post",
                headers={"Authorization": f"Bearer {token_a}"},
                data={"content": "Hello", "visibility": "PUBLIC", "source_post_id": draft_a_id},
            )
        assert r_fail.status_code >= 400
        with SessionLocal() as db:
            assert db.query(Post).filter(Post.id == uuid.UUID(draft_a_id)).first().status == "draft"

        # 3. Successful LinkedIn publish marks draft_a as 'published'
        with patch("app.repositories.connection.get_valid_linkedin_connection_token", return_value=("tok", _FakeConn())), \
             patch("app.services.linkedin_publisher.publish_direct_post", return_value="urn:li:share:999"):
            r_ok = client.post(
                "/api/linkedin/post",
                headers={"Authorization": f"Bearer {token_a}"},
                data={"content": "Hello", "visibility": "PUBLIC", "source_post_id": draft_a_id},
            )
        assert r_ok.status_code == 201
        with SessionLocal() as db:
            src = db.query(Post).filter(Post.id == uuid.UUID(draft_a_id)).first()
            assert src.status == "published"
            assert "urn:li:share:999" in (src.topic_url or "")
    finally:
        with SessionLocal() as db:
            db.query(PostPublication).filter(PostPublication.user_id.in_([uid_a, uid_b])).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id.in_([uid_a, uid_b])).delete(synchronize_session=False)
            db.commit()
