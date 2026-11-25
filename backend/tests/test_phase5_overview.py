"""Integration tests for Phase 5: Admin Overview endpoint and 60s Redis caching/invalidation."""

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
from app.services import admin_overview
from tests.conftest import create_test_token


class _FakeRedis:
    def __init__(self):
        self.store = {}

    def get(self, key):
        return self.store.get(key)

    def setex(self, key, ttl, value):
        self.store[key] = value

    def delete(self, *keys):
        for k in keys:
            self.store.pop(k, None)


@pytest.fixture
def seed_admin_user():
    admin_id = str(uuid.uuid4())
    admin_email = "ahmadimran@mbstack.net"
    existing = None
    with SessionLocal() as db:
        existing = db.execute(
            text('SELECT id::text, "emailVerified" FROM neon_auth."user" WHERE lower(email) = :e LIMIT 1'),
            {"e": admin_email},
        ).fetchone()
        if existing:
            admin_id = existing.id
            if not existing.emailVerified:
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
                {"id": admin_id, "name": "Overview Admin", "email": admin_email},
            )
        db.commit()

    yield {"admin_id": admin_id, "admin_email": admin_email}

    if existing is None:
        with SessionLocal() as db:
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": admin_id})
            db.commit()


def test_admin_overview_and_redis_cache(seed_admin_user, ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_token = create_test_token(
        private_key,
        sub=seed_admin_user["admin_id"],
        email=seed_admin_user["admin_email"],
        name="Admin",
    )
    client = TestClient(app)
    fake_redis = _FakeRedis()

    with patch.object(admin_overview, "get_redis_client", return_value=fake_redis):
        # 1. Cold call -> cached=False, populates Redis
        res1 = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {admin_token}"})
        assert res1.status_code == 200
        d1 = res1.json()
        assert d1["cached"] is False
        assert len(d1["daily_series"]) == 30
        assert len(d1["plan_breakdown"]) == 5
        assert "estimated_mrr_usd" in d1["kpis"]
        assert admin_overview.ADMIN_OVERVIEW_CACHE_KEY in fake_redis.store

        # 2. Second call -> cached=True
        res2 = client.get("/api/admin/overview", headers={"Authorization": f"Bearer {admin_token}"})
        assert res2.status_code == 200
        assert res2.json()["cached"] is True

        # 3. ?refresh=true skips cache and returns fresh cached=False
        res3 = client.get(
            "/api/admin/overview?refresh=true",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res3.status_code == 200
        assert res3.json()["cached"] is False

        # 4. Invalidation deletes cache key
        admin_overview.invalidate_admin_overview_cache()
        assert admin_overview.ADMIN_OVERVIEW_CACHE_KEY not in fake_redis.store
