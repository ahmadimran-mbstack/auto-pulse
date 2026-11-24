"""Phase 2 tests: plan-based Redis fixed-window rate limiting and fallbacks."""

import datetime
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
from app.db.session import SessionLocal
from app.main import app
from app.models.subscription import Subscription


class _FakeRedis:
    def __init__(self):
        self.counts = {}
        self.ttls = {}
        self.kv = {}

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
        self.ttls[k] = ttl


def test_payment_submit_rate_limit_and_headers():
    uid = f"test-rl-{uuid.uuid4()}"
    fake_redis = _FakeRedis()
    app.dependency_overrides[current_user] = lambda: User(id=uid, email="rl@example.com")
    client = TestClient(app)
    try:
        with patch("app.core.limiter.get_redis_client", return_value=fake_redis):
            for i in range(5):
                r = client.post(
                    "/api/billing/payments",
                    json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": "!!bad"},
                )
                assert r.status_code == 400
                assert r.headers.get("X-RateLimit-Limit") == "5"
                assert r.headers.get("X-RateLimit-Remaining") == str(4 - i)

            # 6th request in the hour -> 429
            r6 = client.post(
                "/api/billing/payments",
                json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": "!!bad"},
            )
            assert r6.status_code == 429
            assert "Retry-After" in r6.headers
            assert "Free trial" in r6.json()["error"]["message"]
    finally:
        app.dependency_overrides.pop(current_user, None)
        with SessionLocal() as db:
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.commit()


def test_expired_user_blocked_on_generate_and_redis_down_fallbacks():
    uid = f"test-rl-exp-{uuid.uuid4()}"
    with SessionLocal() as db:
        db.add(
            Subscription(
                user_id=uid,
                plan_id="starter",
                status="active",
                billing_interval="monthly",
                current_period_start=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=40),
                current_period_end=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=10),
            )
        )
        db.commit()

    app.dependency_overrides[current_user] = lambda: User(id=uid, email="exp@example.com")
    client = TestClient(app)
    try:
        # Expired user on generate -> 403
        r_gen = client.post("/api/playground/runs" if False else "/playground/runs", json={})
        assert r_gen.status_code == 403
        assert r_gen.json()["error"]["message"] == "Your plan has ended. Upgrade to continue."

        # Expired user on api bucket with Redis down -> fails open with trial limit header (30)
        with patch("app.core.limiter.get_redis_client", return_value=None):
            r_api = client.get("/api/billing/status")
            assert r_api.status_code == 200
            assert r_api.headers.get("X-RateLimit-Limit") == "30"

            r_pub = client.get("/api/plans")
            assert r_pub.status_code == 200
            assert r_pub.headers.get("X-RateLimit-Limit") == "60"
    finally:
        app.dependency_overrides.pop(current_user, None)
        with SessionLocal() as db:
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.commit()
