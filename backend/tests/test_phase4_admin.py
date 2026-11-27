"""Integration tests for Phase 4: plan changes, subscription end dates, subscribers, usage, and plans."""

import datetime
import sys
from pathlib import Path
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import auth
from app.db.session import SessionLocal
from app.main import app
from app.models.admin import AdminAuditLog, EmailLog
from app.models.post import GenerationRun, Post
from app.models.publication import PostPublication
from app.models.subscription import Payment, Subscription
from app.models.usage import LLMCallLog
from app.services import notifications
from tests.conftest import create_test_token


@pytest.fixture
def seed_phase4_users():
    admin_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    trial_user_id = str(uuid.uuid4())
    admin_email = "ahmadimran@mbstack.net"
    user_email = f"p4-paid-{uuid.uuid4().hex[:8]}@example.com"
    trial_email = f"p4-trial-{uuid.uuid4().hex[:8]}@example.com"
    existing_admin = None

    with SessionLocal() as db:
        existing_admin = db.execute(
            text('SELECT id::text, "emailVerified" FROM neon_auth."user" WHERE lower(email) = :e LIMIT 1'),
            {"e": admin_email},
        ).fetchone()
        if existing_admin:
            admin_id = existing_admin.id
            if not existing_admin.emailVerified:
                db.execute(
                    text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE id::text = :id'),
                    {"id": admin_id},
                )
        else:
            db.execute(
                text(
                    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                    'VALUES (:id, :name, :email, true, now(), now())'
                ),
                {"id": admin_id, "name": "P4 Admin", "email": admin_email},
            )

        for uid, email, name in (
            (user_id, user_email, "Paid User"),
            (trial_user_id, trial_email, "Trial User"),
        ):
            db.execute(
                text(
                    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                    'VALUES (:id, :name, :email, true, now(), now())'
                ),
                {"id": uid, "name": name, "email": email},
            )
        db.commit()

    yield {
        "admin_id": admin_id,
        "admin_email": admin_email,
        "user_id": user_id,
        "user_email": user_email,
        "trial_user_id": trial_user_id,
        "trial_email": trial_email,
    }

    with SessionLocal() as db:
        for uid in (user_id, trial_user_id):
            db.query(LLMCallLog).filter(LLMCallLog.user_id == uid).delete(synchronize_session=False)
            db.query(PostPublication).filter(PostPublication.user_id == uid).delete(synchronize_session=False)
            db.query(GenerationRun).filter(GenerationRun.user_id == uid).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
            db.query(Payment).filter(Payment.user_id == uid).delete(synchronize_session=False)
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.query(AdminAuditLog).filter(AdminAuditLog.target_id == uid).delete(synchronize_session=False)
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": uid})
        if existing_admin is None:
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": admin_id})
        db.commit()


def test_phase4_plan_change_end_date_subscribers_usage_and_plans(seed_phase4_users, ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_token = create_test_token(
        private_key,
        sub=seed_phase4_users["admin_id"],
        email=seed_phase4_users["admin_email"],
        name="Admin",
    )
    uid = seed_phase4_users["user_id"]
    user_email = seed_phase4_users["user_email"]
    trial_uid = seed_phase4_users["trial_user_id"]
    trial_email = seed_phase4_users["trial_email"]
    client = TestClient(app)

    # 1. Cannot set 'internal' on a non-admin user
    internal_res = client.patch(
        f"/api/admin/users/{uid}/plan",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "plan_id": "internal",
            "billing_interval": None,
            "expected_plan_id": "trial",
            "reset_quota_cycle": False,
            "reason": "Try internal",
            "send_email": False,
        },
    )
    assert internal_res.status_code == 403

    # 2. Change user from trial (no subscription row yet) -> starter with reset_quota_cycle=True
    plan_res = client.patch(
        f"/api/admin/users/{uid}/plan",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "plan_id": "starter",
            "billing_interval": "monthly",
            "expected_plan_id": "trial",
            "reset_quota_cycle": True,
            "reason": "Manual upgrade to Starter",
            "send_email": True,
            "admin_message": "Welcome to Starter!",
        },
    )
    assert plan_res.status_code == 200
    body = plan_res.json()
    assert body["plan_id"] == "starter"
    assert body["current_period_start"] is not None
    assert body["current_period_end"] is None  # Plan change does not alter end date
    assert body["email_status"] == "queued"

    # 3. Stale expected_plan_id -> 409 Conflict
    stale_res = client.patch(
        f"/api/admin/users/{uid}/plan",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "plan_id": "pro",
            "billing_interval": "monthly",
            "expected_plan_id": "trial",
            "reset_quota_cycle": False,
            "reason": "Stale request",
            "send_email": False,
        },
    )
    assert stale_res.status_code == 409

    # 4. Set subscription end date: past date rejected unless force=True, future normalized to 23:59:59 UTC
    past_res = client.post(
        f"/api/admin/users/{uid}/subscription-end",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"current_period_end": "2020-01-01", "reason": "Past test without force", "force": False},
    )
    assert past_res.status_code == 400

    future_date = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=5)).date().isoformat()
    end_res = client.post(
        f"/api/admin/users/{uid}/subscription-end",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"current_period_end": future_date, "reason": "Extend 5 days manually", "force": False},
    )
    assert end_res.status_code == 200
    assert end_res.json()["current_period_end"].startswith(f"{future_date}T23:59:59")

    # 5. Seed generation_run, post, publication, and llm_call_log for usage accuracy check
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    with SessionLocal() as db:
        run = GenerationRun(
            user_id=uid,
            run_date=now_utc.date(),
            run_type="scheduled",
            usage_kind="scheduled",
            status="succeeded",
            started_at=now_utc,
        )
        post = Post(
            user_id=uid,
            run_date=now_utc.date(),
            status="published",
            topic_title="Usage Test",
            topic_url="https://example.com",
            sources=[],
            caption="Test",
            hashtags=[],
            image_spec={},
            llm_model="gemini-3.5-flash-lite",
            prompt_version="v1",
        )
        db.add_all([run, post])
        db.flush()
        pub = PostPublication(
            user_id=uid,
            post_id=post.id,
            platform="linkedin",
            status="published",
            published_at=now_utc,
        )
        log = LLMCallLog(
            run_id=run.id,
            user_id=uid,
            kind="scheduled",
            model="gemini-3.5-flash-lite",
            input_tokens=1500,
            output_tokens=400,
            cost_micro_usd=25000,  # $0.0250
            created_at=now_utc,
        )
        # Seed trial user subscription for trial usage view
        db.add(
            Subscription(
                user_id=trial_uid,
                plan_id="trial",
                status="trialing",
                trial_ends_at=now_utc + datetime.timedelta(days=2),
            )
        )
        db.add_all([pub, log])
        db.commit()

    # 6. GET /api/admin/subscribers
    subs_res = client.get(
        f"/api/admin/subscribers?search={user_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert subs_res.status_code == 200
    subs_data = subs_res.json()
    assert subs_data["summary"]["paid_subscribers"] >= 1
    assert subs_data["summary"]["estimated_mrr_usd"] >= 9.99
    assert len(subs_data["items"]) == 1
    assert subs_data["items"][0]["plan_id"] == "starter"
    assert subs_data["items"][0]["scheduled_used"] == 1

    # 7. GET /api/admin/usage (paid + trial views)
    usage_paid = client.get(
        f"/api/admin/usage?view=paid&search={user_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert usage_paid.status_code == 200
    u_item = usage_paid.json()["items"][0]
    assert u_item["posts_generated"] == 1
    assert u_item["posts_published"] == 1
    assert u_item["tokens_in"] == 1500
    assert u_item["tokens_out"] == 400
    assert u_item["cost_usd"] == 0.025
    assert u_item["quota_used"] == 1
    assert u_item["today_spend_usd"] == 0.025
    assert "sources_note" in usage_paid.json()

    usage_trial = client.get(
        f"/api/admin/usage?view=trial&search={trial_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert usage_trial.status_code == 200
    assert usage_trial.json()["items"][0]["trial_days_left"] == 2

    # 8. GET /api/admin/plans (read-only)
    plans_res = client.get(
        "/api/admin/plans",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert plans_res.status_code == 200
    plan_ids = [p["id"] for p in plans_res.json()["plans"]]
    assert plan_ids == ["trial", "starter", "pro", "business", "internal"]
