"""Tests for explicit approval timing, timeline computation, DST, reminders, and schedule changes."""

import datetime
import uuid
from unittest.mock import patch

import pytest

from app.core.auth import User, current_user
from app.db.session import SessionLocal
from app.jobs import dispatch as dispatch_job
from app.models.approval import Approval
from app.models.post import Post
from app.models.profile import Profile
from app.services.schedule_timeline import (
    ALLOWED_APPROVAL_LEAD_MINUTES,
    DRAFT_GENERATION_BUFFER_MINUTES,
    compute_post_timeline,
)


@pytest.fixture
def timing_env():
    uid = f"test-timing-{uuid.uuid4().hex[:8]}"

    def _override_user():
        return User(id=uid, email=f"{uid}@example.com", name="Timing User")

    from app.main import app

    app.dependency_overrides[current_user] = _override_user
    with SessionLocal() as db:
        db.add(
            Profile(
                user_id=uid,
                timezone="America/New_York",
                post_time=datetime.time(10, 0),
                post_days=[0, 1, 2, 3, 4],
                onboarding_completed_at=datetime.datetime.now(datetime.timezone.utc),
            )
        )
        db.commit()

    yield uid

    app.dependency_overrides.pop(current_user, None)
    with SessionLocal() as db:
        db.query(Approval).filter(Approval.user_id == uid).delete(synchronize_session=False)
        db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
        db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
        db.commit()


def test_timeline_all_lead_times_and_too_close_and_dst():
    now = datetime.datetime(2026, 3, 8, 1, 0, tzinfo=datetime.timezone.utc)
    # 2026-03-08 is US DST spring forward (2:00 AM -> 3:00 AM). 10:00 EDT = 14:00 UTC.
    pub = datetime.datetime(2026, 3, 8, 14, 0, tzinfo=datetime.timezone.utc)

    for lead in ALLOWED_APPROVAL_LEAD_MINUTES:
        tl = compute_post_timeline(pub, approval_lead_minutes=lead, tz_name="America/New_York", now_utc=now)
        assert tl.approval_at_utc == pub - datetime.timedelta(minutes=lead)
        assert tl.draft_at_utc == tl.approval_at_utc - datetime.timedelta(minutes=DRAFT_GENERATION_BUFFER_MINUTES)
        assert tl.timezone_offset == "UTC-4"
        assert tl.too_close is False

    # Too close: publish in 90 minutes with 180m lead time
    soon_pub = now + datetime.timedelta(minutes=90)
    tl_close = compute_post_timeline(soon_pub, approval_lead_minutes=180, tz_name="America/New_York", now_utc=now)
    assert tl_close.too_close is True
    assert tl_close.effective_approval_at_utc == now
    assert tl_close.minutes_before_publish == 90


def test_default_lead_time_and_schedule_change_invalidates_old_approval(client, timing_env):
    uid = timing_env
    res_get = client.get("/profile")
    assert res_get.status_code == 200
    assert res_get.json()["approval_lead_minutes"] == 180

    with SessionLocal() as db:
        post = Post(
            user_id=uid,
            run_date=datetime.date(2026, 11, 21),
            status="awaiting_approval",
            publish_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3),
            topic_title="Old Scheduled Post",
            topic_url="",
            sources=[],
            caption="Old caption",
            image_spec={},
            llm_model="test",
            prompt_version="v1",
        )
        db.add(post)
        db.flush()
        app_row = Approval(
            user_id=uid,
            post_id=post.id,
            channel="email",
            token_hash=f"hash-{uuid.uuid4().hex}",
            expires_at=post.publish_at,
            sent_at=datetime.datetime.now(datetime.timezone.utc),
        )
        db.add(app_row)
        db.commit()
        post_id = post.id
        app_id = app_row.id

    # Change schedule -> old awaiting_approval post & approval must be invalidated
    res_patch = client.patch("/profile", json={"post_time": "16:00", "approval_lead_minutes": 360})
    assert res_patch.status_code == 200
    assert res_patch.json()["approval_lead_minutes"] == 360

    with SessionLocal() as db:
        old_post = db.query(Post).filter(Post.id == post_id).first()
        old_app = db.query(Approval).filter(Approval.id == app_id).first()
        assert old_post.status == "expired"
        assert old_app.expires_at <= datetime.datetime.now(datetime.timezone.utc)


def test_reminder_sends_only_once_and_unapproved_expires_with_notice(timing_env):
    uid = timing_env
    now = datetime.datetime.now(datetime.timezone.utc)

    with SessionLocal() as db:
        post = Post(
            user_id=uid,
            run_date=now.date(),
            status="awaiting_approval",
            publish_at=now + datetime.timedelta(minutes=20),
            topic_title="Pending Reminder Post",
            topic_url="",
            sources=[],
            caption="Pending caption",
            image_spec={},
            llm_model="test",
            prompt_version="v1",
        )
        db.add(post)
        db.flush()
        app_row = Approval(
            user_id=uid,
            post_id=post.id,
            channel="email",
            token_hash=f"hash-{uuid.uuid4().hex}",
            expires_at=post.publish_at,
            sent_at=now - datetime.timedelta(hours=2),
        )
        db.add(app_row)
        db.commit()

        with patch("app.services.approval.get_user_email", return_value="timing@example.com"), patch(
            "app.services.email.send_reminder_email"
        ) as mock_rem:
            c1 = dispatch_job.send_due_reminders(db)
            c2 = dispatch_job.send_due_reminders(db)
            assert c1 == 1
            assert c2 == 0
            assert mock_rem.call_count == 1

        # Now move publish_at to past -> expire_passed_posts marks expired & sends skipped notice once
        post.publish_at = now - datetime.timedelta(minutes=1)
        db.commit()
        with patch("app.services.approval.get_user_email", return_value="timing@example.com"), patch(
            "app.services.email.send_skipped_notice_email"
        ) as mock_skip:
            exp1 = dispatch_job.expire_passed_posts(db)
            exp2 = dispatch_job.expire_passed_posts(db)
            assert exp1 >= 1
            assert exp2 == 0
            assert mock_skip.call_count == 1
        db.refresh(post)
        assert post.status == "expired"


def test_onboarding_step4_persists_approval_lead_minutes(timing_env):
    from fastapi.testclient import TestClient
    from app.main import app

    uid = timing_env
    # Reset onboarding state to simulate a user in onboarding
    with SessionLocal() as db:
        prof = db.query(Profile).filter(Profile.user_id == uid).first()
        prof.onboarding_completed_at = None
        prof.approval_lead_minutes = 180
        db.commit()

    client = TestClient(app)

    # PUT /profile/onboarding/4 saves custom approval_lead_minutes=360
    res = client.put(
        "/profile/onboarding/4",
        json={
            "timezone": "America/New_York",
            "post_time": "14:30",
            "post_days": [0, 2, 4],
            "approval_method": "email",
            "approval_lead_minutes": 360,
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["approval_lead_minutes"] == 360
    assert data["post_time"] == "14:30"

    # GET /profile returns 360 (resume / back-and-forth persistence)
    res_get = client.get("/profile")
    assert res_get.status_code == 200
    assert res_get.json()["approval_lead_minutes"] == 360

    # Invalid lead time is rejected
    res_bad = client.put(
        "/profile/onboarding/4",
        json={
            "timezone": "America/New_York",
            "post_time": "14:30",
            "post_days": [0, 2, 4],
            "approval_method": "email",
            "approval_lead_minutes": 90,
        },
    )
    assert res_bad.status_code == 422
