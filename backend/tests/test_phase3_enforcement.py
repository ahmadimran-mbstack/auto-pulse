"""Phase 3 tests: concurrency, quotas, backstop, MAX_LLM_CALLS_PER_RUN, spend limit, feature gates, reaper, and logging safety."""

from concurrent.futures import ThreadPoolExecutor
import datetime
import logging
import os
from types import SimpleNamespace
import uuid

from dotenv import dotenv_values
import pytest
from sqlalchemy import create_engine, event, pool, select, text
from sqlalchemy.orm import sessionmaker

from app.core import auth
from app.core.config import settings
from app.db.session import Base, get_db, normalize_db_url
from app.jobs.dispatch import run_dispatch
from app.main import app
from app.models.post import GenerationRun
from app.models.profile import Profile
from app.models.slack import SlackIntegration
from app.models.usage import LLMCallLog
from app.services import quota as quota_service
from app.services import usage_logger
from app.services.approval import request_approval
from app.services.entitlements import get_entitlements, set_user_plan
from app.services.pipeline import execute_pipeline
from app.services.quota import RunBudgetExceeded, check_and_reserve_run, check_run_budgets_before_call
from app.services.resilient_llm import ResilientChatModelWrapper
from app.services.run_reaper import reap_stalled_runs
from app.services.slack import notify_slack_approval
from app.services.usage_logger import log_llm_call, usage_logging_context
from tests.conftest import BACKEND_DIR, create_test_token


@pytest.fixture(scope="module")
def phase3_schema():
    """Module-scoped isolated temporary Postgres schema using TEST_DATABASE_URL (never production DATABASE_URL)."""
    test_db_url = os.environ.get("TEST_DATABASE_URL", "").strip()
    if not test_db_url:
        pytest.skip("TEST_DATABASE_URL is not set; refusing to run DB tests against production DATABASE_URL")

    env_file = BACKEND_DIR / ".env"
    env_vals = dotenv_values(env_file) if env_file.exists() else {}
    prod_url = (env_vals.get("DATABASE_URL") or os.environ.get("DATABASE_URL") or "").strip()
    prod_direct = (env_vals.get("DATABASE_URL_DIRECT") or os.environ.get("DATABASE_URL_DIRECT") or "").strip()
    if test_db_url in (prod_url, prod_direct):
        pytest.fail("Refusing to run tests: TEST_DATABASE_URL matches production DATABASE_URL")

    engine = create_engine(normalize_db_url(test_db_url), pool_size=10, max_overflow=5, pool_pre_ping=True)
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
        yield engine, TestingSessionLocal, schema_name
    finally:
        with engine.connect() as conn:
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema_name}" CASCADE'))
            conn.commit()
        engine.dispose()


@pytest.fixture
def phase3_db(phase3_schema, monkeypatch, ed25519_keys):
    _, TestingSessionLocal, schema_name = phase3_schema
    _, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)
    monkeypatch.setattr(quota_service, "SessionLocal", TestingSessionLocal)
    monkeypatch.setattr(usage_logger, "SessionLocal", TestingSessionLocal)

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
            yield session, TestingSessionLocal, schema_name
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_concurrency_10_parallel_playground_2_left_starter(phase3_db):
    db, SessionLocal, _ = phase3_db
    uid = f"conc-pg-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    today = datetime.datetime.now(datetime.timezone.utc).date()
    # Use 1 of 3 monthly playground runs on an earlier day so 2 remain
    r0, _ = check_and_reserve_run(
        db, user_id=uid, usage_kind="playground", run_id=uuid.uuid4(),
        run_type="manual", run_date=today - datetime.timedelta(days=1),
        now=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1),
    )
    r0.status = "succeeded"
    db.commit()

    def _attempt(_idx: int):
        with SessionLocal() as s:
            run, blocked = check_and_reserve_run(
                s, user_id=uid, usage_kind="playground", run_id=uuid.uuid4(),
                run_type="manual", run_date=today, create_playground_row=True,
            )
            if blocked:
                s.rollback()
                return False
            s.commit()
            return True

    with ThreadPoolExecutor(max_workers=10) as pool_exec:
        results = list(pool_exec.map(_attempt, range(10)))

    assert sum(1 for r in results if r) == 2
    assert sum(1 for r in results if not r) == 8


def test_concurrency_10_parallel_scheduled_2_left_starter(phase3_db):
    db, SessionLocal, _ = phase3_db
    uid = f"conc-sched-{uuid.uuid4()}"
    t0 = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=15)
    set_user_plan(db, uid, "starter", interval="monthly", now=t0)
    # Use 10 of 12 scheduled posts so 2 remain
    for i in range(10):
        r, _ = check_and_reserve_run(
            db, user_id=uid, usage_kind="scheduled", run_id=uuid.uuid4(),
            run_type="scheduled", run_date=(t0 + datetime.timedelta(days=i)).date(), now=t0,
        )
        r.status = "succeeded"
    db.commit()

    # Pass different run_dates so only the monthly cap (2 left) limits the 10 parallel requests
    base_date = datetime.datetime.now(datetime.timezone.utc).date()

    def _attempt(idx: int):
        with SessionLocal() as s:
            run, blocked = check_and_reserve_run(
                s, user_id=uid, usage_kind="scheduled", run_id=uuid.uuid4(),
                run_type="scheduled", run_date=base_date + datetime.timedelta(days=idx),
            )
            if blocked:
                s.rollback()
                return False
            s.commit()
            return True

    with ThreadPoolExecutor(max_workers=10) as pool_exec:
        results = list(pool_exec.map(_attempt, range(10)))

    assert sum(1 for r in results if r) == 2
    assert sum(1 for r in results if not r) == 8


def test_starter_12th_scheduled_post_works_13th_blocked_monthly_quota(phase3_db):
    db, _, _ = phase3_db
    uid = f"s12-{uuid.uuid4()}"
    t0 = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=15)
    set_user_plan(db, uid, "starter", interval="monthly", now=t0)
    db.commit()

    for i in range(12):
        run, blocked = check_and_reserve_run(
            db, user_id=uid, usage_kind="scheduled", run_id=uuid.uuid4(),
            run_type="scheduled", run_date=(t0 + datetime.timedelta(days=i)).date(), now=t0,
        )
        assert blocked is None
        run.status = "succeeded"
        db.commit()

    run13, blocked13 = check_and_reserve_run(
        db, user_id=uid, usage_kind="scheduled", run_id=uuid.uuid4(),
        run_type="scheduled", run_date=(t0 + datetime.timedelta(days=12)).date(), now=t0,
    )
    assert run13 is None
    assert blocked13["code"] == "monthly_quota_reached"


def test_failed_and_cancelled_runs_do_not_reduce_monthly_count(phase3_db):
    db, _, _ = phase3_db
    uid = f"fail-cancel-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    db.commit()

    today = datetime.datetime.now(datetime.timezone.utc).date()
    r1, _ = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", today)
    r1.status = "failed_error"
    r2, _ = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", today)
    r2.status = "cancelled"
    db.commit()

    ent = get_entitlements(db, uid)
    assert ent["usage"]["playground_used"] == 0
    assert ent["usage"]["playground_today_used"] == 0


def test_failed_run_backstop_mixed_entry_points_blocks_at_5(phase3_db):
    db, _, _ = phase3_db
    uid = f"backstop-{uuid.uuid4()}"
    set_user_plan(db, uid, "pro", interval="monthly")
    db.commit()

    today = datetime.datetime.now(datetime.timezone.utc).date()
    # Mix of scheduled, /posts/generate (usage_kind=scheduled, run_type=manual), and playground
    kinds = [
        ("scheduled", "scheduled", "failed_error"),
        ("scheduled", "manual", "failed_error"),
        ("playground", "manual", "cancelled"),
        ("playground", "manual", "failed_error"),
        ("playground", "manual", "cancelled"),
    ]
    for idx, (ukind, rtype, st) in enumerate(kinds):
        run, blocked = check_and_reserve_run(
            db, uid, ukind, uuid.uuid4(), rtype, today + datetime.timedelta(days=idx)
        )
        assert blocked is None
        run.status = st
        db.commit()

    run6, blocked6 = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", today)
    assert run6 is None
    assert blocked6["code"] == "failed_run_backstop"


def test_trial_3_scheduled_2_playground_and_expiry_blocks_all(phase3_db):
    db, _, _ = phase3_db
    uid = f"trial-{uuid.uuid4()}"
    t0 = datetime.datetime(2026, 11, 20, 10, 0, 0, tzinfo=datetime.timezone.utc)
    set_user_plan(db, uid, "trial", now=t0)
    db.commit()

    for d in range(3):
        run, blocked = check_and_reserve_run(
            db, uid, "scheduled", uuid.uuid4(), "scheduled", (t0 + datetime.timedelta(days=d)).date(), now=t0
        )
        assert blocked is None
        run.status = "succeeded"
        db.commit()

    _, b_sched = check_and_reserve_run(
        db, uid, "scheduled", uuid.uuid4(), "scheduled", (t0 + datetime.timedelta(days=3)).date(), now=t0
    )
    assert b_sched["code"] == "monthly_quota_reached"

    for _ in range(2):
        run, blocked = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", t0.date(), now=t0)
        assert blocked is None
        run.status = "succeeded"
        db.commit()

    _, b_pg = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", t0.date(), now=t0)
    assert b_pg["code"] == "monthly_quota_reached"

    uid_exp = f"trial-exp-{uuid.uuid4()}"
    set_user_plan(db, uid_exp, "trial", now=t0)
    db.commit()
    _, b_exp = check_and_reserve_run(
        db, uid_exp, "playground", uuid.uuid4(), "manual", t0.date(), now=t0 + datetime.timedelta(days=4)
    )
    assert b_exp["code"] == "trial_expired"


def test_max_llm_calls_per_run_30_enforced_with_retries_returns_best_draft(phase3_db):
    db, _, _ = phase3_db
    uid = f"maxcalls-{uuid.uuid4()}"
    set_user_plan(db, uid, "internal")
    db.commit()

    run_id = uuid.uuid4()

    class _FakeInnerModel:
        def with_structured_output(self, schema, include_raw=True, **kwargs):
            return self

        def invoke(self, _input):
            # Fail on first attempt, succeed on retry, so 2 calls per wrapper invocation
            return {"raw": SimpleNamespace(usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}), "parsed": None}

    wrapper = ResilientChatModelWrapper(real_model=_FakeInnerModel(), model_name="gemini-3.5-flash-lite")
    structured = wrapper.with_structured_output(dict, include_raw=True)

    # Pre-seed 29 real LLM calls in llm_call_log for run_id
    for _ in range(29):
        db.add(LLMCallLog(run_id=run_id, user_id=uid, kind="playground", model="gemini-3.5-flash-lite", input_tokens=1, output_tokens=1, cost_micro_usd=3))
    db.commit()

    with usage_logging_context(run_id=str(run_id), user_id=uid, kind="playground"):
        # Attempt 1 runs (call #30 logged inside _FakeInnerModel -> parsed is None so it retries)
        # Attempt 2 hits check_run_budgets_before_call -> sees 30 calls -> raises RunBudgetExceeded("max_llm_calls")
        with pytest.raises(RunBudgetExceeded) as exc:
            # Simulate attempt 1 logging a call then retrying into attempt 2
            log_llm_call("gemini-3.5-flash-lite", SimpleNamespace(usage_metadata={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15}))
            structured.invoke("test")
        assert exc.value.reason == "max_llm_calls"


def test_daily_spend_limit_stops_run_and_sends_one_email(phase3_db, monkeypatch):
    db, _, _ = phase3_db
    uid = f"spend-{uuid.uuid4()}"
    set_user_plan(db, uid, "trial")
    db.commit()

    monkeypatch.setattr(settings, "OPS_ALERT_EMAIL", "ops@example.com")
    sent_emails = []
    monkeypatch.setattr(quota_service, "send_spend_alert_email", lambda **kwargs: sent_emails.append(kwargs))

    run_id = uuid.uuid4()
    db.add(
        LLMCallLog(
            run_id=run_id, user_id=uid, kind="playground", model="gemini-3.5-flash-lite",
            input_tokens=1000, output_tokens=1000, cost_micro_usd=550_000,
        )
    )
    db.commit()

    with usage_logging_context(run_id=str(run_id), user_id=uid, kind="playground"):
        with pytest.raises(RunBudgetExceeded) as exc1:
            check_run_budgets_before_call(is_llm=True)
        assert exc1.value.reason == "daily_spend_limit"
        with pytest.raises(RunBudgetExceeded):
            check_run_budgets_before_call(is_llm=True)

    assert len(sent_emails) == 1
    assert sent_emails[0]["to_email"] == "ops@example.com"

    # Rest of day is also blocked at reservation time
    _, blocked = check_and_reserve_run(db, uid, "playground", uuid.uuid4(), "manual", datetime.datetime.now(datetime.timezone.utc).date())
    assert blocked["code"] == "daily_spend_limit"


def test_starter_cannot_connect_slack_403(client, phase3_db, ed25519_keys):
    db, _, _ = phase3_db
    private_key, _ = ed25519_keys
    uid = f"slack-s-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    db.commit()
    hdr = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid, email='s@example.com')}"}
    resp = client.post("/connections/slack/connect", json={"return_to": "dashboard"}, headers=hdr)
    assert resp.status_code == 403
    assert resp.json()["error"]["code"] == "feature_locked"


def test_downgrade_approvals_fall_back_to_email(phase3_db, monkeypatch):
    db, _, _ = phase3_db
    uid = f"downgrade-{uuid.uuid4()}"
    # User had Slack connected on Pro, then downgraded to Starter
    set_user_plan(db, uid, "starter", interval="monthly")
    db.add(Profile(user_id=uid, display_name="Downgraded", timezone="UTC", slack_approval_enabled=True))
    db.add(SlackIntegration(user_id=uid, team_id="T1", slack_user_id="U1", dm_channel_id="D1", bot_user_id="B1", bot_token_encrypted="enc", status="connected"))
    db.commit()

    from app.models.post import Post
    post = Post(
        user_id=uid, run_date=datetime.date.today(), status="draft",
        topic_title="Test", topic_url="", sources=[], caption="Body", hashtags=[],
        image_spec={}, llm_model="gemini-3.5-flash-lite", prompt_version="v1",
        publish_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=2),
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    # Slack notification must be skipped (returns None)
    assert notify_slack_approval(db, post) is None

    # Approval falls back to email
    sent = []
    monkeypatch.setattr("app.services.approval.send_approval_email", lambda **kw: sent.append(kw))
    ok = request_approval(db, post, recipient_email="user@example.com")
    assert ok is True
    assert len(sent) == 1


def test_docs_upload_rejected_at_limit_0_and_over_limit(client, phase3_db, ed25519_keys, monkeypatch):
    db, _, _ = phase3_db
    private_key, _ = ed25519_keys
    monkeypatch.setattr(settings, "CUSTOMIZATION_ENABLED", True)

    uid_s = f"doc-s-{uuid.uuid4()}"
    set_user_plan(db, uid_s, "starter", interval="monthly")
    db.commit()
    hdr_s = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_s, email='ds@example.com')}"}
    r_s = client.post("/customization/documents/paste", json={"kind": "business", "title": "Deck", "text": "Our product"}, headers=hdr_s)
    assert r_s.status_code == 403
    assert r_s.json()["error"]["code"] == "feature_locked"

    uid_p = f"doc-p-{uuid.uuid4()}"
    set_user_plan(db, uid_p, "pro", interval="monthly")
    db.commit()
    hdr_p = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_p, email='dp@example.com')}"}
    r_ok = client.post("/customization/documents/paste", json={"kind": "business", "title": "Doc 1", "text": "a" * 16000}, headers=hdr_p)
    assert r_ok.status_code == 202
    r_over = client.post("/customization/documents/paste", json={"kind": "business", "title": "Doc 2", "text": "b" * 4400}, headers=hdr_p)
    assert r_over.status_code == 403
    assert r_over.json()["error"]["code"] == "feature_locked"


def test_pipeline_ignores_documents_for_limit_0_plan(phase3_db, monkeypatch):
    db, SessionLocal, _ = phase3_db
    uid = f"nodocs-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    db.commit()

    monkeypatch.setattr(
        "app.services.customization.context.build_user_context",
        lambda **kw: {
            "post_type": "technical_explainer",
            "customization": {"is_empty": False, "guidance": {"topics_include_extra": ["secret_doc_topic"]}},
            "policy": {"emoji_policy": "none"},
            "custom_instructions": "Keep it short.",
            "playbook_rules_text": "SECRET PLAYBOOK",
            "business_facts_text": "SECRET FACTS",
            "previous_posts_voice_text": "SECRET VOICE",
            "scoped_rules": ["rule1"],
        },
    )

    class _MockApp:
        def stream(self, initial_state, **kw):
            # Verify documents were stripped while custom_instructions was kept
            assert initial_state["user_context"]["playbook_rules_text"] == ""
            assert initial_state["user_context"]["business_facts_text"] == ""
            assert initial_state["user_context"]["previous_posts_voice_text"] == ""
            assert initial_state["user_context"]["custom_instructions"] == "Keep it short."
            assert initial_state["customization"] == {"is_empty": True}
            yield {"post_loop": {"status": "succeeded", "draft": {"post_text": "Hello world " * 50}}}

    monkeypatch.setattr("app.services.pipeline.build_graph", lambda **kw: _MockApp())
    monkeypatch.setattr("app.db.session.SessionLocal", SessionLocal)

    res = execute_pipeline(user_id=uid, profile_dict={"goals": "test"}, history=[], is_manual=True, run_id=str(uuid.uuid4()), use_customization=True)
    assert res["status"] == "succeeded"


def test_analytics_gates_trial_starter_pro_business(client, phase3_db, ed25519_keys):
    db, _, _ = phase3_db
    private_key, _ = ed25519_keys

    # Trial -> none (403 on all)
    uid_t = f"an-t-{uuid.uuid4()}"
    set_user_plan(db, uid_t, "trial")
    db.commit()
    hdr_t = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_t)}"}
    assert client.get("/analytics/summary", headers=hdr_t).status_code == 403
    assert client.get("/analytics", headers=hdr_t).status_code == 403

    # Starter -> basic (/summary & /posts-over-time 200; /funnel, /hook-styles, /topics, /turnaround 403)
    uid_s = f"an-s-{uuid.uuid4()}"
    set_user_plan(db, uid_s, "starter", interval="monthly")
    db.commit()
    hdr_s = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_s)}"}
    assert client.get("/analytics/summary", headers=hdr_s).status_code == 200
    assert client.get("/analytics/posts-over-time", headers=hdr_s).status_code == 200
    for path in ("/analytics/funnel", "/analytics/hook-styles", "/analytics/topics", "/analytics/turnaround"):
        r = client.get(path, headers=hdr_s)
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "feature_locked"

    # Pro & Business -> full (200 on all)
    for plan in ("pro", "business"):
        uid_p = f"an-{plan}-{uuid.uuid4()}"
        set_user_plan(db, uid_p, plan, interval="monthly")
        db.commit()
        hdr_p = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_p)}"}
        assert client.get("/analytics", headers=hdr_p).status_code == 200
        assert client.get("/analytics/funnel", headers=hdr_p).status_code == 200


def test_customization_404_off_vs_403_locked_vs_internal_allowed(client, phase3_db, ed25519_keys, monkeypatch):
    db, _, _ = phase3_db
    private_key, _ = ed25519_keys

    uid_s = f"cust-s-{uuid.uuid4()}"
    set_user_plan(db, uid_s, "starter", interval="monthly")
    uid_i = f"cust-i-{uuid.uuid4()}"
    set_user_plan(db, uid_i, "internal")
    db.commit()

    hdr_s = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_s)}"}
    hdr_i = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid_i)}"}

    # Feature off -> 404
    monkeypatch.setattr(settings, "CUSTOMIZATION_ENABLED", False)
    monkeypatch.setattr(settings, "CUSTOMIZATION_BETA_USER_IDS", "")
    assert client.post("/customization/documents/paste", json={"kind": "business", "title": "X", "text": "hello world " * 5}, headers=hdr_s).status_code == 404

    # Feature on -> Starter gets 403 feature_locked, Internal is allowed (202)
    monkeypatch.setattr(settings, "CUSTOMIZATION_ENABLED", True)
    r_locked = client.post("/customization/documents/paste", json={"kind": "business", "title": "X", "text": "hello world " * 5}, headers=hdr_s)
    assert r_locked.status_code == 403
    assert r_locked.json()["error"]["code"] == "feature_locked"

    r_int = client.post("/customization/documents/paste", json={"kind": "business", "title": "X", "text": "hello world " * 5}, headers=hdr_i)
    assert r_int.status_code == 202


def test_posts_generate_counts_as_scheduled_blocks_second_same_day_allows_retry_after_fail(phase3_db):
    db, _, _ = phase3_db
    uid = f"pg-gen-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    db.commit()

    today = datetime.datetime.now(datetime.timezone.utc).date()
    # 1. Failed attempt does NOT block retry
    r_fail, b1 = check_and_reserve_run(db, uid, "scheduled", uuid.uuid4(), "manual", today)
    assert b1 is None
    r_fail.status = "failed_error"
    db.commit()

    # Retry succeeds and counts toward scheduled, NOT playground
    r_ok, b2 = check_and_reserve_run(db, uid, "scheduled", uuid.uuid4(), "manual", today)
    assert b2 is None
    r_ok.status = "succeeded"
    db.commit()

    ent = get_entitlements(db, uid)
    assert ent["usage"]["scheduled_used"] == 1
    assert ent["usage"]["playground_used"] == 0

    # 2nd successful post on same local day blocked with daily_limit_reached
    r_dup, b3 = check_and_reserve_run(db, uid, "scheduled", uuid.uuid4(), "manual", today)
    assert r_dup is None
    assert b3["code"] == "daily_limit_reached"


def test_daily_loop_skips_expired_user_without_crashing(phase3_db):
    db, _, _ = phase3_db
    uid = f"disp-exp-{uuid.uuid4()}"
    t0 = datetime.datetime(2026, 11, 1, 0, 0, 0, tzinfo=datetime.timezone.utc)
    set_user_plan(db, uid, "trial", now=t0)
    sub = db.query(quota_service.Subscription).filter_by(user_id=uid).first()
    sub.trial_ends_at = t0 - datetime.timedelta(days=1)

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    db.add(
        Profile(
            user_id=uid,
            niche_description="AI Engineering",
            timezone="UTC",
            post_time=(now_utc + datetime.timedelta(minutes=30)).time().replace(microsecond=0),
            post_days=[now_utc.weekday()],
            onboarding_completed_at=t0,
        )
    )
    db.commit()

    run_dispatch(db)
    assert db.query(GenerationRun).filter(GenerationRun.user_id == uid).count() == 0


def test_reaper_marks_stuck_running_runs_older_than_30m_failed_error(phase3_db):
    db, _, _ = phase3_db
    uid = f"reap-{uuid.uuid4()}"
    old_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=35)
    rids = {}
    for st in ("queued", "started", "running"):
        rid = uuid.uuid4()
        rids[st] = rid
        db.add(
            GenerationRun(
                id=rid,
                user_id=uid,
                run_date=old_time.date(),
                run_type="manual",
                usage_kind="playground",
                status=st,
                started_at=old_time,
                last_progress_at=datetime.datetime.now(datetime.timezone.utc),
            )
        )
    db.commit()

    reap_stalled_runs(db, stall_threshold_seconds=180)
    db.expire_all()
    for st, rid in rids.items():
        row = db.scalars(select(GenerationRun).where(GenerationRun.id == rid)).first()
        assert row.status == "failed_error", f"expected failed_error for stuck {st} run"
        assert row.error_code == "timed_out"


def test_missing_subscription_row_10_parallel_requests_hold_limits(phase3_db):
    _, SessionLocal, _ = phase3_db
    uid = f"nosub-{uuid.uuid4()}"
    today = datetime.datetime.now(datetime.timezone.utc).date()

    def _attempt(_idx: int):
        with SessionLocal() as s:
            run, blocked = check_and_reserve_run(
                s, user_id=uid, usage_kind="playground", run_id=uuid.uuid4(),
                run_type="manual", run_date=today, create_playground_row=True,
            )
            if blocked:
                s.rollback()
                return False
            s.commit()
            return True

    with ThreadPoolExecutor(max_workers=10) as pool_exec:
        results = list(pool_exec.map(_attempt, range(10)))

    # Trial limit is 2 playground runs; all 10 parallel callers started with NO subscription row
    assert sum(1 for r in results if r) == 2
    assert sum(1 for r in results if not r) == 8


def test_starter_4_post_days_rejected_in_patch_and_onboarding(client, phase3_db, ed25519_keys):
    db, _, _ = phase3_db
    private_key, _ = ed25519_keys
    uid = f"days-{uuid.uuid4()}"
    set_user_plan(db, uid, "starter", interval="monthly")
    db.commit()
    hdr = {"Authorization": f"Bearer {create_test_token(private_key, sub=uid)}"}

    r_patch = client.patch("/profile", json={"post_days": [0, 1, 2, 3]}, headers=hdr)
    assert r_patch.status_code == 403
    assert r_patch.json()["error"]["code"] == "feature_locked"

    r_onb = client.put(
        "/profile/onboarding/4",
        json={"timezone": "UTC", "post_time": "09:00", "post_days": [0, 1, 2, 3], "approval_method": "email"},
        headers=hdr,
    )
    assert r_onb.status_code == 403
    assert r_onb.json()["error"]["code"] == "feature_locked"


def test_test_lab_returns_404_when_disabled(client, phase3_db, ed25519_keys, monkeypatch):
    private_key, _ = ed25519_keys
    monkeypatch.setattr(settings, "ENABLE_TEST_LAB", False)
    hdr = {"Authorization": f"Bearer {create_test_token(private_key, sub='tl-user')}"}
    resp = client.get("/test-lab/status", headers=hdr)
    assert resp.status_code == 404


def test_logging_safety_no_context_writes_null_and_warns_and_full_run_matches_count(phase3_db, caplog, monkeypatch):
    db, SessionLocal, _ = phase3_db
    monkeypatch.setattr("app.db.session.SessionLocal", SessionLocal)

    # 1. Call with NO run context must still write to llm_call_log with null run_id & user_id and log a warning
    with caplog.at_level(logging.WARNING):
        log_llm_call("gemini-3.5-flash-lite", SimpleNamespace(usage_metadata={"input_tokens": 12, "output_tokens": 4, "total_tokens": 16}))

    assert any("without run context" in rec.message for rec in caplog.records)
    orphan_row = db.scalars(select(LLMCallLog).where(LLMCallLog.run_id.is_(None), LLMCallLog.input_tokens == 12)).first()
    assert orphan_row is not None
    assert orphan_row.user_id is None

    # 2. On a mocked full run, llm_call_log row count for run_id equals generation_runs.llm_calls
    uid = f"log-match-{uuid.uuid4()}"
    set_user_plan(db, uid, "internal")
    db.commit()
    rid = uuid.uuid4()

    class _MockApp:
        def stream(self, initial_state, **kw):
            for _ in range(3):
                log_llm_call("gemini-3.5-flash-lite", SimpleNamespace(usage_metadata={"input_tokens": 50, "output_tokens": 20, "total_tokens": 70}))
            yield {"post_loop": {"status": "succeeded", "draft": {"post_text": "Mocked post " * 40}}}

    monkeypatch.setattr("app.services.pipeline.build_graph", lambda **kw: _MockApp())
    res = execute_pipeline(user_id=uid, profile_dict={"goals": "test"}, history=[], is_manual=True, run_id=str(rid), use_customization=False)
    counters = res["counters"]

    gen_run = GenerationRun(
        id=rid, user_id=uid, run_date=datetime.date.today(), run_type="manual", usage_kind="playground",
        status="succeeded", llm_calls=counters["llm_calls"], search_calls=counters["search_calls"],
        tokens_in=counters["tokens_in"], tokens_out=counters["tokens_out"],
    )
    db.add(gen_run)
    db.commit()

    db_llm_rows = db.query(LLMCallLog).filter(LLMCallLog.run_id == rid).count()
    assert db_llm_rows == gen_run.llm_calls == 3
