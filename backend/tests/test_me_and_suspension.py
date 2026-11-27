"""Tests for GET /me (is_admin, status, onboarding_completed) and Redis-backed suspension."""

import datetime
import uuid
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core import auth
from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.profile import Profile
from app.services import account_status
from tests.conftest import create_test_token


def test_me_endpoint_admin_verification_and_onboarding(ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_uid = str(uuid.uuid4())
    admin_email = f"adm-{uuid.uuid4().hex[:8]}@example.com"
    user_uid = str(uuid.uuid4())
    user_email = f"usr-{uuid.uuid4().hex[:8]}@example.com"
    unver_uid = str(uuid.uuid4())
    unver_email = f"unver-{uuid.uuid4().hex[:8]}@example.com"

    monkeypatch.setattr(settings, "ADMIN_EMAILS", f" {admin_email.upper()} , {unver_email} ")

    with SessionLocal() as db:
        db.execute(
            text(
                'INSERT INTO neon_auth."user" (id, name, email, "emailVerified") '
                "VALUES (:id1, 'Adm', :e1, true), (:id2, 'Usr', :e2, true), (:id3, 'Unver', :e3, false) "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {"id1": admin_uid, "e1": admin_email, "id2": user_uid, "e2": user_email, "id3": unver_uid, "e3": unver_email},
        )
        db.add(
            Profile(
                user_id=user_uid,
                display_name="Usr",
                onboarding_completed_at=datetime.datetime.now(datetime.timezone.utc),
                account_status="active",
            )
        )
        db.commit()

    client = TestClient(app)
    try:
        # 1. Verified admin email -> is_admin=True, onboarding_completed=False
        t_adm = create_test_token(private_key, sub=admin_uid, email=admin_email, name="Adm")
        r_adm = client.get("/me", headers={"Authorization": f"Bearer {t_adm}"})
        assert r_adm.status_code == 200
        body_adm = r_adm.json()
        assert body_adm["is_admin"] is True
        assert body_adm["status"] == "active"
        assert body_adm["onboarding_completed"] is False

        # 2. Unverified email in ADMIN_EMAILS -> is_admin=False
        t_unver = create_test_token(private_key, sub=unver_uid, email=unver_email, name="Unver")
        r_unver = client.get("/me", headers={"Authorization": f"Bearer {t_unver}"})
        assert r_unver.status_code == 200
        assert r_unver.json()["is_admin"] is False

        # 3. Normal verified user with onboarding_complete=True
        t_usr = create_test_token(private_key, sub=user_uid, email=user_email, name="Usr")
        r_usr = client.get("/me", headers={"Authorization": f"Bearer {t_usr}"})
        assert r_usr.status_code == 200
        body_usr = r_usr.json()
        assert body_usr["is_admin"] is False
        assert body_usr["status"] == "active"
        assert body_usr["onboarding_completed"] is True
    finally:
        with SessionLocal() as db:
            db.query(Profile).filter(Profile.user_id.in_([admin_uid, user_uid, unver_uid])).delete(synchronize_session=False)
            db.execute(
                text('DELETE FROM neon_auth."user" WHERE id::text IN (:id1, :id2, :id3)'),
                {"id1": admin_uid, "id2": user_uid, "id3": unver_uid},
            )
            db.commit()


def test_suspension_redis_cache_invalidation_and_db_fallback(ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    uid = str(uuid.uuid4())
    email = f"susp-{uuid.uuid4().hex[:8]}@example.com"
    with SessionLocal() as db:
        db.add(
            Profile(
                user_id=uid,
                display_name="Susp",
                onboarding_completed_at=datetime.datetime.now(datetime.timezone.utc),
                account_status="suspended",
            )
        )
        db.commit()

    client = TestClient(app)
    token = create_test_token(private_key, sub=uid, email=email, name="Susp")

    try:
        # 1. Redis down -> falls back to DB and still returns 403 account_suspended
        broken_redis = MagicMock()
        broken_redis.get.side_effect = RuntimeError("Redis down")
        broken_redis.setex.side_effect = RuntimeError("Redis down")
        with patch("app.services.account_status.get_redis_client", return_value=broken_redis):
            r_db = client.get("/me", headers={"Authorization": f"Bearer {token}"})
        assert r_db.status_code == 403
        assert r_db.json()["error"]["code"] == "account_suspended"

        # 2. Redis working -> caches user_status:{uid} with 60s TTL, and invalidation deletes it
        store = {}
        fake_redis = MagicMock()
        fake_redis.get.side_effect = lambda k: store.get(k)
        fake_redis.setex.side_effect = lambda k, ttl, v: store.__setitem__(k, v)
        fake_redis.delete.side_effect = lambda k: store.pop(k, None)

        with patch("app.services.account_status.get_redis_client", return_value=fake_redis):
            r_cached = client.get("/me", headers={"Authorization": f"Bearer {token}"})
            assert r_cached.status_code == 403
            assert store.get(f"user_status:{uid}") == "suspended"

            # Unsuspend in DB + invalidate cache -> immediately active
            with SessionLocal() as db:
                db.execute(text("UPDATE profiles SET account_status = 'active' WHERE user_id = :uid"), {"uid": uid})
                db.commit()
            account_status.invalidate_user_status_cache(uid)
            assert f"user_status:{uid}" not in store

            r_ok = client.get("/me", headers={"Authorization": f"Bearer {token}"})
            assert r_ok.status_code == 200
            assert store.get(f"user_status:{uid}") == "active"
    finally:
        with SessionLocal() as db:
            db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
            db.commit()
