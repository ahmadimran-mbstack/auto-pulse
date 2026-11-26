"""Phase B Step 1 tests: Decimal annual pricing rule, cached DB loader, Redis version bump, and fallback."""

from dataclasses import asdict
import logging
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, event, pool, text
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import plans as plans_mod
from app.core.plans import (
    ANNUAL_DISCOUNT,
    PLANS,
    cents_to_usd,
    compute_annual_cents,
    compute_plan_price,
    get_plan,
    get_plans,
    get_public_plan_order,
    get_purchasable_plan_ids,
    invalidate_plans_cache,
    usd_to_cents,
)
from app.services.admin_users import _plan_limit_sql_case
from app.services.entitlements import get_public_plans_payload


class _FakeRedis:
    def __init__(self, initial_ver: str = "1"):
        self.store = {plans_mod.PLANS_VERSION_REDIS_KEY: initial_ver}
        self.get_calls = 0

    def get(self, key: str):
        self.get_calls += 1
        return self.store.get(key)

    def incr(self, key: str):
        val = int(self.store.get(key) or "0") + 1
        self.store[key] = str(val)
        return val


def test_decimal_annual_rule_reproduces_all_stored_prices():
    assert ANNUAL_DISCOUNT == 0.05
    expected = {
        "starter": (999, 11388, 949),
        "pro": (1999, 22788, 1899),
        "business": (3999, 45588, 3799),
    }
    for pid, (monthly_c, annual_c, equiv_c) in expected.items():
        cfg = PLANS[pid]
        assert usd_to_cents(cfg.monthly_price_usd) == monthly_c
        calc_annual_c, calc_equiv_c = compute_annual_cents(monthly_c)
        assert calc_annual_c == annual_c
        assert calc_equiv_c == equiv_c
        assert cents_to_usd(calc_annual_c) == cfg.annual_price_usd
        assert cents_to_usd(calc_equiv_c) == cfg.annual_monthly_equivalent_usd

    assert compute_annual_cents(None) == (None, None)
    assert compute_annual_cents(0) == (None, None)


def test_get_plans_fallback_and_warning_on_db_error(caplog):
    invalidate_plans_cache()
    with (
        patch.object(plans_mod, "_get_redis_client_safe", return_value=None),
        patch.object(plans_mod, "_load_entries_from_db", side_effect=plans_mod._load_entries_from_db),
        patch("app.db.session.SessionLocal", side_effect=RuntimeError("db down")),
    ):
        with caplog.at_level(logging.WARNING, logger="app.core.plans"):
            loaded = get_plans()

    assert set(loaded.keys()) == set(PLANS.keys())
    for pid, cfg in PLANS.items():
        assert asdict(loaded[pid]) == asdict(cfg)
    assert any("falling back to plans.py" in rec.message for rec in caplog.records)
    invalidate_plans_cache()


def test_get_plans_caches_in_process_checks_redis_every_2s_and_reloads_on_bump():
    invalidate_plans_cache()
    fake_redis = _FakeRedis("1")
    db_calls = 0

    def fake_load():
        nonlocal db_calls
        db_calls += 1
        return dict(plans_mod._FALLBACK_ENTRIES), True

    fake_clock = [100.0]

    with (
        patch.object(plans_mod, "_get_redis_client_safe", return_value=fake_redis),
        patch.object(plans_mod, "_load_entries_from_db", side_effect=fake_load),
        patch.object(plans_mod.time, "monotonic", side_effect=lambda: fake_clock[0]),
    ):
        # Cold call checks Redis once and loads DB once
        get_plans()
        assert db_calls == 1
        assert fake_redis.get_calls == 1

        # Calls within 2 seconds use pure in-process cache (no Redis or DB call)
        fake_clock[0] = 101.0
        get_plans()
        get_plans()
        assert db_calls == 1
        assert fake_redis.get_calls == 1

        # After 2 seconds with same Redis version: checks Redis, does NOT reload DB
        fake_clock[0] = 103.5
        get_plans()
        assert fake_redis.get_calls == 2
        assert db_calls == 1

        # Bump version and advance >2s: reloads from DB
        fake_redis.incr(plans_mod.PLANS_VERSION_REDIS_KEY)
        fake_clock[0] = 106.0
        get_plans()
        assert fake_redis.get_calls == 3
        assert db_calls == 2

    invalidate_plans_cache()


def test_plan_limit_sql_case_includes_else_fallback():
    invalidate_plans_cache()
    with patch.object(plans_mod, "_get_redis_client_safe", return_value=None):
        sql_case = _plan_limit_sql_case()
    assert "ELSE 3 END" in sql_case
    assert "WHEN 'starter' THEN 12" in sql_case
    assert "WHEN 'internal' THEN NULL" in sql_case


def test_isolated_schema_migration_sql_and_parity(caplog):
    """Run exact Step 1 migration SQL in a disposable schema and verify DB read matches plans.py."""
    import importlib.util
    from app.db.session import normalize_db_url
    import os
    from dotenv import dotenv_values

    mig_path = BACKEND_DIR / "alembic" / "versions" / "x3a4b5c6d7e8_add_plans_table.py"
    spec = importlib.util.spec_from_file_location("x3a4b5c6d7e8_mig", mig_path)
    mig = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mig)

    env_file = BACKEND_DIR / ".env"
    env_vals = dotenv_values(env_file) if env_file.exists() else {}
    db_url = (
        env_vals.get("DATABASE_URL_DIRECT")
        or os.environ.get("DATABASE_URL_DIRECT")
        or env_vals.get("DATABASE_URL")
        or os.environ.get("DATABASE_URL")
    )
    if not db_url:
        pytest.skip("No Postgres URL configured")
    if "-pooler." in db_url and not env_vals.get("DATABASE_URL_DIRECT"):
        db_url = db_url.replace("-pooler.", ".")

    schema_name = f"test_plans_{uuid.uuid4().hex[:10]}"
    engine = create_engine(normalize_db_url(db_url), poolclass=pool.NullPool)

    with engine.connect() as conn:
        conn.execute(text(f'CREATE SCHEMA "{schema_name}"'))
        conn.commit()

    @event.listens_for(engine, "connect")
    def _set_path(dbapi_conn, _rec):
        cur = dbapi_conn.cursor()
        cur.execute(f'SET search_path TO "{schema_name}", public')
        cur.close()

    TempSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    try:
        with TempSession() as db:
            db.execute(text(mig.CREATE_PLANS_TABLE_SQL))
            db.execute(text(mig.CREATE_PLANS_INDEX_SQL))
            db.execute(text(mig.SEED_PLANS_SQL))
            db.commit()

        invalidate_plans_cache()
        with (
            patch("app.db.session.SessionLocal", TempSession),
            patch.object(plans_mod, "_get_redis_client_safe", return_value=None),
            caplog.at_level(logging.WARNING, logger="app.core.plans"),
        ):
            db_plans = get_plans()
            assert not [r for r in caplog.records if "falling back" in r.message]
            assert set(db_plans.keys()) == set(PLANS.keys())
            for pid, expected_cfg in PLANS.items():
                assert asdict(get_plan(pid)) == asdict(expected_cfg)

            assert get_public_plan_order() == ("trial", "starter", "pro", "business")
            assert get_purchasable_plan_ids() == ("starter", "pro", "business")
            for pid in ("starter", "pro", "business"):
                for interval in ("monthly", "annual"):
                    c_usd, c_pkr = compute_plan_price(pid, interval)
                    assert c_usd > 0 and c_pkr > 0

            payload = get_public_plans_payload()
            assert [p["id"] for p in payload["plans"]] == ["trial", "starter", "pro", "business"]
    finally:
        invalidate_plans_cache()
        with engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            conn.commit()
        engine.dispose()
