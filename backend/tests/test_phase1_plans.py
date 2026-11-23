"""Phase 1 tests: plans config, subscriptions, trial clock, backfill, set_plan, and API routes."""

import datetime
import os
import uuid

from dotenv import dotenv_values
import pytest
from sqlalchemy import create_engine, event, pool, text
from sqlalchemy.orm import sessionmaker

from app.core import auth
from app.core.plans import PLANS, PKR_PER_USD, TRIAL_DAYS, usd_to_pkr_approx
from app.db.session import Base, get_db, normalize_db_url
from app.main import app
from app.repositories import profile as profile_repo
from app.services.entitlements import (
    compute_subscription_status,
    get_entitlements,
    mark_onboarding_completed,
    set_user_plan,
)
from tests.conftest import BACKEND_DIR, create_test_token


@pytest.fixture
def phase1_db(monkeypatch, ed25519_keys):
    """Isolated temporary Postgres schema using TEST_DATABASE_URL (never production DATABASE_URL)."""
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    test_db_url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL is not set; refusing to run DB tests against production DATABASE_URL")

    env_file = BACKEND_DIR / ".env"
    env_vals = dotenv_values(env_file) if env_file.exists() else {}
    prod_url = (env_vals.get("DATABASE_URL") or os.environ.get("DATABASE_URL") or "").strip()
    prod_direct = (env_vals.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL_DIRECT") or "").strip()
    if test_db_url in (prod_url, prod_direct):
        pytest.fail("Refusing to run tests: TEST_DATABASE_URL matches production DATABASE_URL")

    engine = create_engine(normalize_db_url(test_db_url), pool_size=5, max_overflow=5, pool_pre_ping=True)
    schema_name = f"test_{uuid.uuid4().hex[:12]}"

    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        conn.commit()

    @event.listens_for(engine, "connect")
    def _set_search_path(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute(f'SET search_path TO "{schema_name}", public')
        cursor.close()

    with engine.connect() as conn:
        Base.metadata.create_all(bind=conn)
        conn.commit()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            db.execute(text(f'SET search_path TO "{schema_name}", public'))
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestingSessionLocal() as session:
            session.execute(text(f'SET search_path TO "{schema_name}", public'))
            yield session
    finally:
        app.dependency_overrides.pop(get_db, None)
        with engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            conn.commit()
        engine.dispose()


def test_public_plans_endpoint_excludes_internal_and_formats_pkr(client):
    resp = client.get("/api/plans")
    assert resp.status_code == 200
    data = resp.json()
    assert data["pkr_per_usd"] == PKR_PER_USD
    ids = [p["id"] for p in data["plans"]]
    assert ids == ["trial", "starter", "pro", "business"]
    assert "internal" not in ids

    starter = next(p for p in data["plans"] if p["id"] == "starter")
    assert starter["monthly_price_usd"] == 9.99
    assert starter["monthly_price_pkr_approx"] == usd_to_pkr_approx(9.99)
    assert starter["annual_price_usd"] == 113.88
    assert starter["annual_monthly_equivalent_usd"] == 9.49

    business = next(p for p in data["plans"] if p["id"] == "business")
    assert business["limits"]["scheduled_posts"] == 30
    assert business["limits"]["max_post_days_per_week"] == 7


def test_new_signup_gets_trial_and_onboarding_starts_clock_idempotently(phase1_db):
    uid = f"user-{uuid.uuid4()}"
    profile = profile_repo.get_or_create_profile(phase1_db, user_id=uid, display_name="Test User")
    phase1_db.commit()

    ent = get_entitlements(phase1_db, uid)
    assert ent["plan_id"] == "trial"
    assert ent["status"] == "trialing"
    assert ent["trial_ends_at"] is None
    assert ent["usage"]["scheduled_used"] == 0

    t0 = datetime.datetime(2026, 11, 23, 12, 0, 0, tzinfo=datetime.timezone.utc)
    mark_onboarding_completed(phase1_db, profile, now=t0)
    phase1_db.commit()

    ent_after = get_entitlements(phase1_db, uid, now=t0)
    expected_end = t0 + datetime.timedelta(days=TRIAL_DAYS)
    assert ent_after["trial_ends_at"] == expected_end.isoformat()
    assert ent_after["status"] == "trialing"

    # Calling again later must NOT move trial_ends_at
    t_later = t0 + datetime.timedelta(days=1)
    mark_onboarding_completed(phase1_db, profile, now=t_later)
    phase1_db.commit()
    ent_repeat = get_entitlements(phase1_db, uid, now=t_later)
    assert ent_repeat["trial_ends_at"] == expected_end.isoformat()


def test_lazy_entitlements_creates_trial_without_profile(client, phase1_db, ed25519_keys):
    private_key, _ = ed25519_keys
    uid = f"user-{uuid.uuid4()}"
    token = create_test_token(private_key, sub=uid, email="lazy@example.com")

    resp = client.get("/api/me/entitlements", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["plan_id"] == "trial"
    assert body["status"] == "trialing"
    assert body["limits"]["scheduled_posts"] == 3


def test_backfilled_existing_user_is_internal(phase1_db):
    uid = f"legacy-{uuid.uuid4()}"
    phase1_db.execute(
        text("INSERT INTO profiles (user_id, display_name) VALUES (:uid, 'Legacy')"),
        {"uid": uid},
    )
    # Run the same idempotent backfill SQL from the migration
    phase1_db.execute(
        text(
            """
            INSERT INTO subscriptions (user_id, plan_id, status, billing_interval, created_at, updated_at)
            SELECT user_id, 'internal', 'active', NULL, now(), now()
            FROM profiles
            ON CONFLICT (user_id) DO NOTHING
            """
        )
    )
    phase1_db.commit()

    ent = get_entitlements(phase1_db, uid)
    assert ent["plan_id"] == "internal"
    assert ent["status"] == "active"
    assert ent["limits"]["scheduled_posts"] is None
    assert ent["features"]["approval_slack"] is True


def test_set_plan_and_expiry_by_date_clock(phase1_db):
    uid = f"user-{uuid.uuid4()}"
    t0 = datetime.datetime(2026, 11, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)

    # Trial expires after 3 days
    sub = set_user_plan(phase1_db, uid, "trial", now=t0)
    phase1_db.commit()
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=2)) == "trialing"
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=3)) == "expired"

    # Starter monthly expires after 30 days
    sub = set_user_plan(phase1_db, uid, "starter", interval="monthly", now=t0)
    phase1_db.commit()
    assert sub.billing_interval == "monthly"
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=29)) == "active"
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=30)) == "expired"

    # Pro annual expires after 365 days
    sub = set_user_plan(phase1_db, uid, "pro", interval="annual", now=t0)
    phase1_db.commit()
    assert sub.billing_interval == "annual"
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=364)) == "active"
    assert compute_subscription_status(sub, now=t0 + datetime.timedelta(days=365)) == "expired"
