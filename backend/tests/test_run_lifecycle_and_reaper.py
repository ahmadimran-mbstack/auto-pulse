import datetime
import time
from unittest.mock import MagicMock, patch
import uuid
import pytest
from sqlalchemy import text

from app.core.config import settings
from app.models.post import GenerationRun, PlaygroundRun
from app.api.routes.playground import run_playground_pipeline_task
from app.services.resilient_llm import run_call_with_timeout
from app.services.run_lock import acquire_manual_run_lock, release_manual_run_lock
from app.services.run_reaper import cleanup_interrupted_runs_on_startup, reap_stalled_runs
from tests.conftest import create_test_token


def _auth_headers(private_key, sub: str = "user-123", name: str = "Test User") -> dict:
    token = create_test_token(private_key=private_key, sub=sub, name=name)
    return {"Authorization": f"Bearer {token}"}


def test_hanging_node_is_cut_by_timeout():
    """1. A hanging node is cut by the timeout, raising TimeoutError."""
    def hanging_function():
        time.sleep(2.0)
        return "completed"

    with pytest.raises(TimeoutError) as exc_info:
        run_call_with_timeout(hanging_function, timeout_seconds=0.1)

    assert "timed out after 0.1s" in str(exc_info.value)


def test_exception_in_task_marks_failed_error_and_releases_lock(db_test_schema):
    """2. An exception in the task marks failed_error with traceback and releases the lock."""
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    user_id = "user_task_crash_test"
    run_id = uuid.uuid4()

    # Pre-acquire lock to verify release in finally
    acquired, _ = acquire_manual_run_lock(user_id, run_id, ttl_seconds=300)
    assert acquired is True

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        p_run = PlaygroundRun(
            id=run_id,
            user_id=user_id,
            status="queued",
            current_step="queued",
            current_node="queued",
            boot_id="old-boot",
        )
        gen_run = GenerationRun(
            id=run_id,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="queued",
            current_step="queued",
            current_node="queued",
            boot_id="old-boot",
        )
        db.add(p_run)
        db.add(gen_run)
        db.commit()

    # Mock SessionLocal and execute_pipeline to raise an error
    with patch("app.api.routes.playground.SessionLocal", SessionLocal), \
         patch("app.api.routes.playground.execute_pipeline", side_effect=RuntimeError("Simulated LLM network collapse")):
        run_playground_pipeline_task(run_id, user_id)

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        db_p = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
        db_gen = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()

        assert db_p is not None
        assert db_p.status == "failed_error"
        assert "RuntimeError" in (db_p.error_reason or "")
        assert "Simulated LLM network collapse" in (db_p.error_reason or "")

        assert db_gen is not None
        assert db_gen.status == "failed_error"
        assert db_gen.error_code == "execution_exception"
        assert "Simulated LLM network collapse" in (db_gen.error_reason or "")

    # The in-flight lock must be released
    new_run_id = uuid.uuid4()
    new_acquired, _ = acquire_manual_run_lock(user_id, new_run_id, ttl_seconds=300)
    assert new_acquired is True
    release_manual_run_lock(user_id, new_run_id)


def test_startup_cleanup_marks_old_boot_runs_interrupted(db_test_schema):
    """3. Startup cleanup marks runs from old boot_ids as interrupted and ignores current boot_id."""
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    current_boot = "boot-new-111"
    old_boot = "boot-old-000"

    run_old = uuid.uuid4()
    run_curr = uuid.uuid4()
    user_id = "user_boot_test"

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # Old run from prior deploy still marked running
        p_old = PlaygroundRun(
            id=run_old,
            user_id=user_id,
            status="running",
            boot_id=old_boot,
            current_step="drafter",
            current_node="drafter",
        )
        gen_old = GenerationRun(
            id=run_old,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="running",
            boot_id=old_boot,
            current_step="drafter",
            current_node="drafter",
        )
        # Current run from this boot
        p_curr = PlaygroundRun(
            id=run_curr,
            user_id=user_id,
            status="running",
            boot_id=current_boot,
            current_step="finder",
            current_node="finder",
        )
        gen_curr = GenerationRun(
            id=run_curr,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="running",
            boot_id=current_boot,
            current_step="finder",
            current_node="finder",
        )
        db.add_all([p_old, gen_old, p_curr, gen_curr])
        db.commit()

        # Run startup cleanup with current_boot
        cleaned = cleanup_interrupted_runs_on_startup(db, current_boot_id=current_boot)
        assert cleaned >= 2

        db_old_p = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_old).first()
        db_old_gen = db.query(GenerationRun).filter(GenerationRun.id == run_old).first()
        assert db_old_p.status == "interrupted"
        assert "Process restarted" in (db_old_p.error_reason or "")
        assert db_old_gen.status == "interrupted"

        db_curr_p = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_curr).first()
        db_curr_gen = db.query(GenerationRun).filter(GenerationRun.id == run_curr).first()
        assert db_curr_p.status == "running"
        assert db_curr_gen.status == "running"


def test_reaper_marks_stale_run_and_ignores_recent_one(db_test_schema):
    """4. The reaper marks runs with no progress for >90s as failed_error and ignores active runs."""
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    user_id = "user_reaper_test"
    stale_id = uuid.uuid4()
    recent_id = uuid.uuid4()

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # 120s ago (stale)
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=120)
        # 15s ago (active)
        fresh_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=15)

        p_stale = PlaygroundRun(
            id=stale_id,
            user_id=user_id,
            status="running",
            current_node="drafter",
            current_step="drafter",
            started_at=past_time,
            last_progress_at=past_time,
        )
        gen_stale = GenerationRun(
            id=stale_id,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="running",
            current_node="drafter",
            current_step="drafter",
            started_at=past_time,
            last_progress_at=past_time,
        )

        p_recent = PlaygroundRun(
            id=recent_id,
            user_id=user_id,
            status="running",
            current_node="detector",
            current_step="detector",
            started_at=fresh_time,
            last_progress_at=fresh_time,
        )
        gen_recent = GenerationRun(
            id=recent_id,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="running",
            current_node="detector",
            current_step="detector",
            started_at=fresh_time,
            last_progress_at=fresh_time,
        )
        db.add_all([p_stale, gen_stale, p_recent, gen_recent])
        db.commit()

        reaped = reap_stalled_runs(db, stall_threshold_seconds=90)
        assert reaped >= 2

        db_stale_p = db.query(PlaygroundRun).filter(PlaygroundRun.id == stale_id).first()
        db_stale_gen = db.query(GenerationRun).filter(GenerationRun.id == stale_id).first()
        assert db_stale_p.status == "timed_out"
        assert "stalled at drafter" in (db_stale_p.error_reason or "")
        assert db_stale_gen.status == "timed_out"
        assert "stalled at drafter" in (db_stale_gen.error_reason or "")

        db_recent_p = db.query(PlaygroundRun).filter(PlaygroundRun.id == recent_id).first()
        db_recent_gen = db.query(GenerationRun).filter(GenerationRun.id == recent_id).first()
        assert db_recent_p.status == "running"
        assert db_recent_gen.status == "running"


def test_two_reapers_cannot_both_update_same_row(db_test_schema):
    """5. Atomic UPDATE ensures two reapers running concurrently cannot conflict."""
    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    user_id = "user_reaper_concurrency"
    run_id = uuid.uuid4()

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        past_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=120)
        p_stale = PlaygroundRun(
            id=run_id,
            user_id=user_id,
            status="running",
            current_node="finder",
            current_step="finder",
            started_at=past_time,
            last_progress_at=past_time,
        )
        db.add(p_stale)
        db.commit()

        # Reaper 1 runs
        first_reaped = reap_stalled_runs(db, stall_threshold_seconds=90)
        assert first_reaped >= 1

        # Reaper 2 runs immediately after
        second_reaped = reap_stalled_runs(db, stall_threshold_seconds=90)
        # Cannot re-reap an already updated row
        assert second_reaped == 0


def test_status_endpoint_reports_stalled(client, db_test_schema, ed25519_keys):
    """6. Status endpoint reports stalled=True for inactive runs and includes Cache-Control: no-store."""
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-stalled-test", name="Stalled Tester")

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    run_id = uuid.uuid4()
    progress_time = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=100)

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        p_run = PlaygroundRun(
            id=run_id,
            user_id="user-stalled-test",
            status="running",
            current_node="gtm_brief",
            current_step="gtm_brief",
            started_at=progress_time,
            last_progress_at=progress_time,
            round=1,
        )
        db.add(p_run)
        db.commit()

    res = client.get(f"/runs/{run_id}", headers=headers)
    assert res.status_code == 200
    assert "no-store" in res.headers.get("Cache-Control", "")
    data = res.json()
    assert data["status"] == "running"
    assert data["stalled"] is True
    assert data["current_node"] == "gtm_brief"
    assert data["elapsed_seconds"] >= 95.0


def test_lock_pointing_at_dead_run_is_ignored(client, db_test_schema, ed25519_keys, monkeypatch):
    """7. If the in-flight lock points at a dead/failed run in the DB, it is ignored and a new run starts."""
    private_key, _ = ed25519_keys
    headers = _auth_headers(private_key, sub="user-dead-lock-test", name="Lock Tester")

    monkeypatch.setattr("app.api.routes.playground.enforce_rate_limit", lambda *args, **kwargs: None)

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    dead_run_id = uuid.uuid4()
    user_id = "user-dead-lock-test"

    # Pre-acquire lock pointing to dead_run_id
    acquire_manual_run_lock(user_id, dead_run_id, ttl_seconds=300)

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        # Dead run is in failed_error in DB
        gen_dead = GenerationRun(
            id=dead_run_id,
            user_id=user_id,
            run_date=datetime.date.today(),
            run_type="manual",
            status="failed_error",
            error_reason="stalled at finder",
        )
        db.add(gen_dead)
        db.commit()

    with patch("app.api.routes.playground.run_playground_pipeline_task"):
        res = client.post("/playground/runs", headers=headers)
        assert res.status_code == 202
        data = res.json()
        # Must NOT return dead_run_id
        assert data["run_id"] != str(dead_run_id)
        assert data["status"] == "queued"

    release_manual_run_lock(user_id, data["run_id"])


def test_run_deadline_returns_passing_draft_or_times_out():
    """8. Run deadline: returns passing draft if one exists, otherwise marks timed_out."""
    from app.services.pipeline import build_graph

    # Case A: Passing draft exists when deadline is hit
    passing_state = {
        "run_id": "test_deadline_pass",
        "user_id": "user_deadline",
        "round": 1,
        "run_deadline": time.time() - 10,  # Deadline expired
        "best_score": 10,  # Below 15 slop threshold
        "best_draft": {
            "post_text": "Production architectures fail at the connection pool boundary.",
            "hashtags": ["#Engineering"],
        },
    }

    # Calling wrap_node directly on a dummy node
    from app.services.pipeline import build_graph
    # We can inspect the _wrap_node logic directly
    def dummy_node(state):
        return {"result": "ok"}

    # We test via the node wrapper logic in pipeline
    from app.services.pipeline import execute_pipeline
    # Mocking app invocation or testing wrapper behavior
    deadline_expired_state = {
        "run_id": "test_deadline_fail",
        "user_id": "user_deadline",
        "round": 0,
        "run_deadline": time.time() - 10,
        "best_score": 999,
        "best_draft": None,
    }

    # Verify directly via build_graph's wrapped node
    app = build_graph(partial=True)
    res_passing = app.invoke(passing_state)
    assert res_passing.get("status") in ("completed", "succeeded")
    assert res_passing.get("draft") is not None
    assert res_passing.get("ai_score") == 10

    res_failing = app.invoke(deadline_expired_state)
    assert res_failing.get("status") == "timed_out"
    assert res_failing.get("error_code") == "timed_out"
    assert "whole-run deadline" in res_failing.get("error_detail", "")
