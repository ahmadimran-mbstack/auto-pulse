"""Phase 5 End-to-End verification covering all 10 required scenarios."""

import concurrent.futures
import datetime
import math
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.auth import User, current_user
from app.core.plans import PKR_PER_USD
from app.db.session import SessionLocal
from app.jobs.dispatch import run_dispatch
from app.main import app
from app.models.profile import Profile
from app.models.subscription import Payment, Subscription
from app.services.entitlements import get_effective_plan


class _InMemRedis:
    def __init__(self):
        self.kv = {}
        self.counts = {}

    def get(self, k):
        return self.kv.get(k)

    def setex(self, k, ttl, v):
        self.kv[k] = v

    def delete(self, k):
        self.kv.pop(k, None)

    def incr(self, k):
        self.counts[k] = self.counts.get(k, 0) + 1
        return self.counts[k]

    def expire(self, k, ttl):
        pass


@pytest.fixture
def e2e_users():
    u1 = f"e2e-u1-{uuid.uuid4()}"
    u2 = f"e2e-u2-{uuid.uuid4()}"
    u3 = f"e2e-u3-{uuid.uuid4()}"
    admin = f"e2e-admin-{uuid.uuid4()}"
    yield {"u1": u1, "u2": u2, "u3": u3, "admin": admin}
    with SessionLocal() as db:
        db.query(Payment).filter(Payment.user_id.in_([u1, u2, u3, admin])).delete(synchronize_session=False)
        db.query(Subscription).filter(Subscription.user_id.in_([u1, u2, u3, admin])).delete(synchronize_session=False)
        db.query(Profile).filter(Profile.user_id.in_([u1, u2, u3, admin])).delete(synchronize_session=False)
        db.commit()


def test_phase5_all_10_scenarios(e2e_users):
    u1, u2, u3, admin_uid = e2e_users["u1"], e2e_users["u2"], e2e_users["u3"], e2e_users["admin"]
    fake_redis = _InMemRedis()
    active_user = {"user": User(id=u1, email="e2e-u1@example.com")}
    app.dependency_overrides[current_user] = lambda: active_user["user"]
    client = TestClient(app)

    try:
        with patch("app.core.limiter.get_redis_client", return_value=fake_redis):
            # 1. New user is on trial
            st1 = client.get("/api/billing/status")
            assert st1.status_code == 200
            assert st1.json()["plan_id"] == "trial"
            assert st1.json()["status"] == "trialing"

            # 2 & 9. User checks out starter monthly, submits JazzCash tx_id with fake amount -> pending, fake amount ignored
            info = client.get("/api/billing/checkout-info?plan=starter&interval=monthly")
            assert info.status_code == 200
            assert info.json()["amount_pkr"] == math.ceil(9.99 * PKR_PER_USD)

            tx1 = f"E2E{uuid.uuid4().hex[:10].upper()}"
            pay1 = client.post(
                "/api/billing/payments",
                json={
                    "plan_id": "starter",
                    "billing_interval": "monthly",
                    "method": "jazzcash",
                    "transaction_id": tx1,
                    "amount_pkr": 1,
                    "amount_usd_cents": 1,
                },
            )
            assert pay1.status_code == 201
            p1_data = pay1.json()
            assert p1_data["status"] == "pending"
            assert p1_data["amount_usd_cents"] == 999
            assert p1_data["amount_pkr"] == math.ceil(9.99 * PKR_PER_USD)
            assert client.get("/api/billing/status").json()["plan_id"] == "trial"

            # 3. Same transaction ID from second user -> 409
            active_user["user"] = User(id=u2, email="e2e-u2@example.com")
            dup = client.post(
                "/api/billing/payments",
                json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx1},
            )
            assert dup.status_code == 409

            # 7. Non-admin calling /api/admin/* -> 403
            assert client.get("/api/admin/me").status_code == 403
            assert client.get("/api/admin/payments?status=pending").status_code == 403
            assert client.post(f"/api/admin/payments/{p1_data['id']}/approve").status_code == 403
            assert client.post(f"/api/admin/payments/{p1_data['id']}/reject", json={"reason": "test"}).status_code == 403

            # 4. Admin approves -> u1 plan becomes starter immediately (cache invalidated) & rate limits switch to Starter (60)
            active_user["user"] = User(id=admin_uid, email="ahmadimran@mbstack.net")
            app_res = client.post(f"/api/admin/payments/{p1_data['id']}/approve")
            assert app_res.status_code == 200
            active_user["user"] = User(id=u1, email="e2e-u1@example.com")
            st_after = client.get("/api/billing/status")
            assert st_after.status_code == 200
            assert st_after.json()["plan_id"] == "starter"
            assert st_after.json()["status"] == "active"
            assert st_after.headers.get("X-RateLimit-Limit") == "60"

            # 5. Two simultaneous approve calls on one payment -> exactly one succeeds (200), one gets 409
            active_user["user"] = User(id=u2, email="e2e-u2@example.com")
            tx_conc = f"CONC{uuid.uuid4().hex[:8].upper()}"
            p_conc = client.post(
                "/api/billing/payments",
                json={"plan_id": "pro", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx_conc},
            ).json()
            active_user["user"] = User(id=admin_uid, email="ahmadimran@mbstack.net")
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                f1 = pool.submit(client.post, f"/api/admin/payments/{p_conc['id']}/approve")
                f2 = pool.submit(client.post, f"/api/admin/payments/{p_conc['id']}/approve")
                codes = sorted([f1.result().status_code, f2.result().status_code])
            assert codes == [200, 409]

            # 6. Rejected payment shows reason, and user can resubmit same tx_id
            active_user["user"] = User(id=u3, email="e2e-u3@example.com")
            tx_rej = f"REJ{uuid.uuid4().hex[:8].upper()}"
            p_rej = client.post(
                "/api/billing/payments",
                json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx_rej},
            ).json()
            active_user["user"] = User(id=admin_uid, email="ahmadimran@mbstack.net")
            rej_res = client.post(f"/api/admin/payments/{p_rej['id']}/reject", json={"reason": "Wrong amount"})
            assert rej_res.status_code == 200
            active_user["user"] = User(id=u3, email="e2e-u3@example.com")
            hist = client.get("/api/billing/status").json()["payments"]
            assert hist[0]["reject_reason"] == "Wrong amount"
            resub = client.post(
                "/api/billing/payments",
                json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx_rej},
            )
            assert resub.status_code == 201

            # 8. Setting current_period_end to past -> expired, generation blocked (403), scheduler skips
            with SessionLocal() as db:
                sub = db.query(Subscription).filter(Subscription.user_id == u1).first()
                sub.current_period_end = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=2)
                db.add(
                    Profile(
                        user_id=u1,
                        timezone="UTC",
                        post_time=datetime.time(12, 0),
                        post_days=[0, 1, 2, 3, 4, 5, 6],
                        niche_description="Backend systems",
                        onboarding_completed_at=datetime.datetime.now(datetime.timezone.utc),
                    )
                )
                db.commit()
                fake_redis.delete(f"effective_plan:{u1}")
                assert get_effective_plan(db, u1, bypass_cache=True)["status"] == "expired"

            active_user["user"] = User(id=u1, email="e2e-u1@example.com")
            gen_blocked = client.post("/playground/runs", json={})
            assert gen_blocked.status_code == 403
            assert "Your plan has ended" in gen_blocked.json()["error"]["message"]

            with SessionLocal() as db:
                with patch("app.jobs.dispatch.generate_draft_for_user") as mock_sched_gen:
                    with patch("app.jobs.dispatch.expire_passed_posts"), \
                         patch("app.jobs.dispatch.send_due_approvals"), \
                         patch("app.jobs.dispatch.retry_unsent_approvals"), \
                         patch("app.jobs.dispatch.send_due_reminders"):
                        run_dispatch(db)
                    for call in mock_sched_gen.call_args_list:
                        assert call.args[1].user_id != u1

            # 10. Rate limit: 6th payment_submit within an hour returns 429
            # (u3 already made 2 payment_submit calls above: p_rej + resub; 3 more -> 5, 6th -> 429)
            active_user["user"] = User(id=u3, email="e2e-u3@example.com")
            for _ in range(3):
                r = client.post(
                    "/api/billing/payments",
                    json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": "!!bad"},
                )
                assert r.status_code == 400
            r6 = client.post(
                "/api/billing/payments",
                json={"plan_id": "pro", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": "!!bad"},
            )
            assert r6.status_code == 429
            assert "Retry-After" in r6.headers
    finally:
        app.dependency_overrides.pop(current_user, None)
