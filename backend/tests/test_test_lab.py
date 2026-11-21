"""Integration and unit tests for the development-only Test Lab module."""

import datetime
import uuid
from unittest.mock import patch

import pytest

from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.social_connection import SocialConnection
from app.models.post import Post
from app.models.profile import Profile
from app.models.slack import SlackIntegration
from app.repositories import post as post_repo
from app.test_lab import service as test_lab_service
from app.test_lab.models import TestLabRun


@pytest.fixture
def test_lab_env():
    orig_enable = settings.ENABLE_TEST_LAB
    orig_emails = settings.TEST_LAB_ALLOWED_EMAILS
    settings.ENABLE_TEST_LAB = True
    settings.TEST_LAB_ALLOWED_EMAILS = ""

    uid_a = f"test-lab-a-{uuid.uuid4().hex[:8]}"
    uid_b = f"test-lab-b-{uuid.uuid4().hex[:8]}"
    state = {"uid": uid_a, "email": "cto@example.com"}

    def _override_user():
        return User(id=state["uid"], email=state["email"], name="Test User")

    from app.main import app

    app.dependency_overrides[current_user] = _override_user

    with SessionLocal() as db:
        db.add(Profile(user_id=uid_a, timezone="Asia/Karachi"))
        db.add(
            SlackIntegration(
                user_id=uid_a,
                team_id="T123",
                team_name="AutoPulse Dev",
                slack_user_id="U999",
                dm_channel_id="D999",
                bot_user_id="U123",
                bot_token_encrypted="enc-bot-token",
                status="connected",
            )
        )
        db.add(
            SocialConnection(
                user_id=uid_a,
                provider="linkedin",
                provider_account_id="li-sub-1",
                account_name="Ahmad",
                access_token_enc="enc-li-token",
                expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30),
                scopes=["openid", "profile", "w_member_social"],
                status="active",
            )
        )
        db.commit()

    yield state, uid_a, uid_b

    app.dependency_overrides.pop(current_user, None)
    settings.ENABLE_TEST_LAB = orig_enable
    settings.TEST_LAB_ALLOWED_EMAILS = orig_emails

    with SessionLocal() as db:
        for uid in (uid_a, uid_b):
            db.query(TestLabRun).filter(TestLabRun.user_id == uid).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
            db.query(SlackIntegration).filter(SlackIntegration.user_id == uid).delete(synchronize_session=False)
            db.query(SocialConnection).filter(SocialConnection.user_id == uid).delete(synchronize_session=False)
            db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
        db.commit()


def test_flag_off_returns_404(client, test_lab_env):
    settings.ENABLE_TEST_LAB = False
    assert client.get("/test-lab/status").status_code == 404
    now = datetime.datetime.now(datetime.timezone.utc)
    assert (
        client.post(
            "/test-lab/runs",
            json={
                "dry_run": True,
                "generate_at": (now + datetime.timedelta(minutes=2)).isoformat(),
                "approve_at": (now + datetime.timedelta(minutes=4)).isoformat(),
                "upload_at": (now + datetime.timedelta(minutes=6)).isoformat(),
            },
        ).status_code
        == 404
    )


def test_allowlist_rejects_unlisted_user(client, test_lab_env):
    state, _, _ = test_lab_env
    settings.TEST_LAB_ALLOWED_EMAILS = "ceo@example.com,cto@example.com"
    assert client.get("/test-lab/status").status_code == 200

    state["email"] = "random@example.com"
    res = client.get("/test-lab/status")
    assert res.status_code == 403


def test_time_order_and_gap_validation(client, test_lab_env):
    now = datetime.datetime.now(datetime.timezone.utc)
    # Generate too soon (< 1 min)
    r1 = client.post(
        "/test-lab/runs",
        json={
            "dry_run": True,
            "generate_at": (now + datetime.timedelta(seconds=20)).isoformat(),
            "approve_at": (now + datetime.timedelta(minutes=3)).isoformat(),
            "upload_at": (now + datetime.timedelta(minutes=5)).isoformat(),
        },
    )
    assert r1.status_code == 422

    # Approve < Generate + 1 min
    r2 = client.post(
        "/test-lab/runs",
        json={
            "dry_run": True,
            "generate_at": (now + datetime.timedelta(minutes=2)).isoformat(),
            "approve_at": (now + datetime.timedelta(minutes=2, seconds=30)).isoformat(),
            "upload_at": (now + datetime.timedelta(minutes=5)).isoformat(),
        },
    )
    assert r2.status_code == 422

    # Upload > 7 days ahead
    r3 = client.post(
        "/test-lab/runs",
        json={
            "dry_run": True,
            "generate_at": (now + datetime.timedelta(minutes=2)).isoformat(),
            "approve_at": (now + datetime.timedelta(minutes=4)).isoformat(),
            "upload_at": (now + datetime.timedelta(days=8)).isoformat(),
        },
    )
    assert r3.status_code == 422


def test_second_active_test_rejected_and_cancel_stops_steps(client, test_lab_env):
    now = datetime.datetime.now(datetime.timezone.utc)
    payload = {
        "dry_run": True,
        "topic_hint": "Postgres connection pooling",
        "generate_at": (now + datetime.timedelta(minutes=2)).isoformat(),
        "approve_at": (now + datetime.timedelta(minutes=4)).isoformat(),
        "upload_at": (now + datetime.timedelta(minutes=6)).isoformat(),
    }
    r1 = client.post("/test-lab/runs", json=payload)
    assert r1.status_code == 201, r1.text
    run_id = r1.json()["id"]

    # Second active test rejected
    r2 = client.post("/test-lab/runs", json=payload)
    assert r2.status_code == 409

    # Cancel stops pending steps
    rc = client.post(f"/test-lab/runs/{run_id}/cancel")
    assert rc.status_code == 200
    body = rc.json()
    assert body["status"] == "cancelled"
    assert body["generate_status"] == "cancelled"
    assert body["approve_status"] == "cancelled"
    assert body["upload_status"] == "cancelled"


def test_atomic_claim_and_dry_run_and_not_approved_skips_publish(test_lab_env):
    _, uid_a, _ = test_lab_env
    past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)

    with SessionLocal() as db:
        run = TestLabRun(
            user_id=uid_a,
            status="scheduled",
            dry_run=True,
            generate_at=past,
            approve_at=past,
            upload_at=past,
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        # Concurrent claim: first succeeds, second returns None
        c1 = test_lab_service._claim_step(db, run.id, "generate")
        c2 = test_lab_service._claim_step(db, run.id, "generate")
        assert c1 is not None
        assert c2 is None

        # Simulate generate + approve completed, test dry_run upload never calls publish
        post = Post(
            user_id=uid_a,
            run_date=past.date(),
            status="awaiting_approval",
            approval_source="test_lab",
            is_test=True,
            topic_title="Dry Run Test",
            topic_url="",
            sources=[],
            caption="Test caption",
            image_spec={},
            llm_model="test",
            prompt_version="v1",
        )
        db.add(post)
        db.flush()
        run.post_id = post.id
        run.generate_status = "completed"
        run.approve_status = "completed"
        db.commit()

        with patch("app.test_lab.service.publish_post_to_linkedin") as mock_pub:
            started_u = test_lab_service._claim_step(db, run.id, "upload")
            assert started_u is not None
            test_lab_service.execute_upload_step(db, run, started_u)
            mock_pub.assert_not_called()
        db.refresh(run)
        assert run.upload_status == "skipped_dry_run"

        # Now test live mode when post is NOT approved -> skipped_not_approved, never calls publish
        run2 = TestLabRun(
            user_id=uid_a,
            status="running",
            dry_run=False,
            generate_at=past,
            approve_at=past,
            upload_at=past,
            generate_status="completed",
            approve_status="completed",
            upload_status="pending",
            post_id=post.id,
        )
        db.add(run2)
        db.commit()
        with patch("app.test_lab.service.publish_post_to_linkedin") as mock_pub2:
            started_u2 = test_lab_service._claim_step(db, run2.id, "upload")
            assert started_u2 is not None
            test_lab_service.execute_upload_step(db, run2, started_u2)
            mock_pub2.assert_not_called()
        db.refresh(run2)
        assert run2.upload_status == "skipped_not_approved"

        # Verify is_test post is excluded from normal posts & history
        posts_list, _ = post_repo.get_caller_posts(db, uid_a)
        assert all(p.id != post.id for p in posts_list)
        hist = post_repo.get_user_post_history(db, uid_a)
        assert all(h["id"] != str(post.id) for h in hist)


def test_generate_step_handles_pipeline_draft_key_and_no_draft_error(test_lab_env):
    _, uid_a, _ = test_lab_env
    past = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)
    future_app = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=2)
    future_upl = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=4)

    with SessionLocal() as db:
        # 1. Pipeline returns no draft -> specific error_details + node
        run_fail = TestLabRun(
            user_id=uid_a,
            status="scheduled",
            dry_run=True,
            generate_at=past,
            approve_at=future_app,
            upload_at=future_upl,
        )
        db.add(run_fail)
        db.commit()
        db.refresh(run_fail)

        started = test_lab_service._claim_step(db, run_fail.id, "generate")
        assert started is not None
        with patch(
            "app.test_lab.service.execute_pipeline",
            return_value={
                "status": "failed_error",
                "error_code": "no_draft_produced",
                "error_node": "writer",
                "last_node": "writer",
                "error_detail": "The pipeline stopped at writer without producing a draft.",
            },
        ):
            test_lab_service.execute_generate_step(db, run_fail, started)

        db.refresh(run_fail)
        assert run_fail.generate_status == "failed"
        assert run_fail.approve_status == "cancelled"
        assert run_fail.upload_status == "cancelled"
        assert run_fail.error_details["generate"]["code"] == "no_draft_produced"
        assert run_fail.error_details["generate"]["node"] == "writer"

        # 2. Regression test for the real bug: pipeline returns 'draft' (not 'final_draft')
        run_ok = TestLabRun(
            user_id=uid_a,
            status="scheduled",
            dry_run=True,
            generate_at=past,
            approve_at=future_app,
            upload_at=future_upl,
        )
        db.add(run_ok)
        db.commit()
        db.refresh(run_ok)

        started_ok = test_lab_service._claim_step(db, run_ok.id, "generate")
        assert started_ok is not None
        with patch(
            "app.test_lab.service.execute_pipeline",
            return_value={
                "status": "completed",
                "last_node": "detector",
                "chosen": {"title": "Connection pooling in Postgres", "url": "https://example.com"},
                "draft": {
                    "post_text": "Most Postgres outages start with idle connections.",
                    "hashtags": ["postgresql"],
                    "first_comment": "Full benchmark notes in our repo.",
                },
            },
        ):
            test_lab_service.execute_generate_step(db, run_ok, started_ok)

        db.refresh(run_ok)
        assert run_ok.generate_status == "completed"
        assert run_ok.post_id is not None
        saved_post = db.query(Post).filter(Post.id == run_ok.post_id).first()
        assert saved_post is not None
        assert saved_post.is_test is True
        assert saved_post.topic_title == "Connection pooling in Postgres"
