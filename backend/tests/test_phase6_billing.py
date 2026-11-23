"""Phase 6 tests: ManualProvider, upgrades/downgrades, and reminder deduplication."""

import datetime
import os
import uuid

from dotenv import dotenv_values
import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker

from app.db.session import Base, normalize_db_url
from app.services.entitlements import get_entitlements, set_user_plan
from app.services.payments import ManualProvider
from app.services.reminders import send_due_subscription_reminders
from tests.conftest import BACKEND_DIR


@pytest.fixture(scope="module")
def phase6_db():
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
    try:
        with TestingSessionLocal() as db:
            db.execute(text(f'SET search_path TO "{schema_name}", public'))
            yield db
    finally:
        with engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            conn.commit()
        engine.dispose()


def test_manual_provider_upgrade_immediate_and_downgrade_at_period_end(phase6_db):
    db = phase6_db
    provider = ManualProvider()
    uid = f"pay-{uuid.uuid4()}"
    t0 = datetime.datetime(2026, 11, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)

    # Start on Starter
    set_user_plan(db, uid, "starter", interval="monthly", now=t0)
    db.commit()

    # Upgrade to Pro at t0 + 10 days -> immediate, new 30-day period from t0 + 10
    t_up = t0 + datetime.timedelta(days=10)
    sub = provider.handle_confirmation(db, uid, "pro", interval="monthly", now=t_up)
    db.commit()
    assert sub.plan_id == "pro"
    assert sub.current_period_start == t_up
    assert sub.current_period_end == t_up + datetime.timedelta(days=30)

    # Downgrade to Starter at t_up + 5 days -> stays Pro until current_period_end
    t_down = t_up + datetime.timedelta(days=5)
    sub = provider.handle_confirmation(db, uid, "starter", interval="monthly", now=t_down)
    db.commit()
    assert sub.plan_id == "pro"
    assert sub.pending_plan_id == "starter"

    # Before period_end -> still Pro
    assert get_entitlements(db, uid, now=t_up + datetime.timedelta(days=29))["plan_id"] == "pro"

    # At period_end -> switches to Starter
    ent_after = get_entitlements(db, uid, now=t_up + datetime.timedelta(days=30))
    assert ent_after["plan_id"] == "starter"
