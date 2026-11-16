import datetime
import logging
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import enforce_rate_limit
from app.db.session import SessionLocal, get_db
from app.models.post import GenerationRun, PlaygroundRun, RunEvent
from app.models.profile import Profile
from app.repositories import post as post_repo
from app.schemas.post import (
    PlaygroundCancelResponse,
    PlaygroundRunCreateRequest,
    PlaygroundRunCreateResponse,
    PlaygroundRunDetail,
    RunEventPublic,
    RunEventsResponse,
)
from app.services.content_profile import get_content_profile
from app.services.pipeline import execute_pipeline
from app.services.pipeline_config import MAX_ROUNDS, PLAIN_TECH_ERROR_MESSAGE, STUCK_RUN_SILENCE_SECONDS
from app.services.run_events import RunEventEmitter
from app.services.run_lock import acquire_manual_run_lock, force_release_manual_run_lock, release_manual_run_lock
from app.services.search import get_search_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playground", tags=["playground"])


def run_playground_pipeline_task(run_id: uuid.UUID, user_id: str, topic_hint: Optional[str] = None) -> None:
    """Background execution for an asynchronous playground run.
    Guarantees:
    - Atomically claims the queued run across generation_runs and playground_runs.
    - Captures complete multi-agent trace, nonzero token metrics, and final draft result.
    - Catches all exceptions, writing failed_error with reason and traceback summary.
    - Always releases in-flight double-click lock in finally block.
    """
    try:
        with SessionLocal() as db:
            # Atomic claim with boot_id and last_progress_at
            claim_stmt = text(
                "UPDATE playground_runs "
                "SET status = 'running', started_at = now(), last_progress_at = now(), boot_id = :boot_id, current_node = 'plan', current_step = 'plan' "
                "WHERE id = :id AND status = 'queued' "
                "RETURNING id"
            )
            claimed_id = db.execute(claim_stmt, {"id": run_id, "boot_id": settings.BOOT_ID}).scalar_one_or_none()
            if claimed_id:
                db.execute(
                    text(
                        "UPDATE generation_runs "
                        "SET status = 'running', started_at = now(), last_progress_at = now(), boot_id = :boot_id, current_node = 'plan', current_step = 'plan' "
                        "WHERE id = :id AND status = 'queued'"
                    ),
                    {"id": run_id, "boot_id": settings.BOOT_ID},
                )
                db.commit()
            else:
                logger.info(f"Playground run {run_id} could not be claimed (already running or cancelled)")
                return

            # Ensure generation_runs record exists for this manual run
            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            if not gen_run:
                gen_run = GenerationRun(
                    id=run_id,
                    user_id=user_id,
                    run_date=datetime.datetime.now(datetime.timezone.utc).date(),
                    run_type="manual",
                    status="running",
                    boot_id=settings.BOOT_ID,
                    current_node="plan",
                    current_step="plan",
                    last_progress_at=datetime.datetime.now(datetime.timezone.utc),
                    search_provider=settings.SEARCH_PROVIDER,
                )
                db.add(gen_run)
                db.commit()

            history = post_repo.get_user_post_history(db, user_id, limit=30)
            search_tool = get_search_adapter(settings.SEARCH_PROVIDER)
            profile_dict = get_content_profile(user_id=user_id, db=db)

            def _step_callback(step_name: str, round_num: int, state: Dict[str, Any]):
                gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
                p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
                now_utc = datetime.datetime.now(datetime.timezone.utc)

                live_trace = dict((gen_run.agent_trace if gen_run else None) or {})
                if state.get("finder_output"):
                    live_trace["finder"] = state.get("finder_output")
                if state.get("gtm_brief"):
                    live_trace["gtm_brief"] = state.get("gtm_brief")
                if state.get("rounds_history"):
                    live_trace["rounds"] = state.get("rounds_history")

                draft_res = state.get("draft")
                topic_idx = state.get("current_topic_index", 0)
                best_draft_val = state.get("best_draft") or draft_res

                if gen_run:
                    gen_run.current_step = step_name
                    gen_run.current_node = step_name
                    gen_run.last_progress_at = now_utc
                    gen_run.round = round_num
                    gen_run.current_round = round_num
                    gen_run.current_topic_index = topic_idx
                    if best_draft_val:
                        gen_run.best_draft = best_draft_val
                    if live_trace:
                        gen_run.agent_trace = live_trace
                    if draft_res:
                        gen_run.result = draft_res

                if p_run:
                    p_run.current_step = step_name
                    p_run.current_node = step_name
                    p_run.last_progress_at = now_utc
                    p_run.round = round_num
                    p_run.current_round = round_num
                    p_run.current_topic_index = topic_idx
                    if best_draft_val:
                        p_run.best_draft = best_draft_val
                    if live_trace:
                        p_run.trace = live_trace
                    if draft_res:
                        p_run.result = draft_res

                db.commit()

            emitter = RunEventEmitter(
                run_id=str(run_id),
                user_id=user_id,
                session_factory=SessionLocal,
                batch_size=4,
            )

            final_state = execute_pipeline(
                user_id=user_id,
                profile_dict=profile_dict,
                history=history,
                search_tool=search_tool,
                step_callback=_step_callback,
                topic_hint=topic_hint,
                is_manual=True,
                run_id=str(run_id),
                event_emitter=emitter,
            )

            counters = final_state.get("counters", {})
            err_code = final_state.get("error_code")
            state_status = final_state.get("status")
            internal_trace_val = final_state.get("internal_trace")
            finished_now = datetime.datetime.now(datetime.timezone.utc)

            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()

            # Cancelled by user
            if state_status == "cancelled" or final_state.get("cancelled") or (p_run and p_run.cancel_requested):
                clean_draft = final_state.get("best_clean_draft") or final_state.get("draft")
                if gen_run:
                    gen_run.status = "cancelled"
                    gen_run.current_step = "cancelled"
                    gen_run.current_node = "cancelled"
                    gen_run.finished_at = finished_now
                    gen_run.best_draft = clean_draft
                    gen_run.result = clean_draft
                    gen_run.internal_trace = internal_trace_val
                if p_run:
                    p_run.status = "cancelled"
                    p_run.current_step = "cancelled"
                    p_run.current_node = "cancelled"
                    p_run.finished_at = finished_now
                    p_run.best_draft = clean_draft
                    p_run.result = clean_draft
                    p_run.internal_trace = internal_trace_val
                db.commit()
                return

            if state_status == "timed_out" or err_code == "timed_out":
                best_clean = final_state.get("best_clean_draft")
                if best_clean:
                    state_status = "succeeded"
                    err_code = None
                    final_state["draft"] = best_clean
                else:
                    if gen_run:
                        gen_run.status = "failed_error"
                        gen_run.current_step = "failed_error"
                        gen_run.current_node = "timeout"
                        gen_run.error_code = "timed_out"
                        gen_run.error_detail = PLAIN_TECH_ERROR_MESSAGE
                        gen_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                        gen_run.finished_at = finished_now
                        gen_run.internal_trace = internal_trace_val
                    if p_run:
                        p_run.status = "failed_error"
                        p_run.current_step = "failed_error"
                        p_run.current_node = "timeout"
                        p_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                        p_run.finished_at = finished_now
                        p_run.result = {"status": "failed_error", "error_detail": PLAIN_TECH_ERROR_MESSAGE}
                        p_run.internal_trace = internal_trace_val
                    db.commit()
                    return

            if err_code or state_status in ("failed_quality", "failed_error", "failed"):
                if gen_run:
                    gen_run.status = "failed_error"
                    gen_run.current_step = "failed_error"
                    gen_run.current_node = "failed_error"
                    gen_run.error_code = err_code or "pipeline_error"
                    gen_run.error_detail = PLAIN_TECH_ERROR_MESSAGE
                    gen_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                    gen_run.search_calls = counters.get("search_calls", 0)
                    gen_run.llm_calls = counters.get("llm_calls", 0)
                    gen_run.tokens_in = counters.get("tokens_in", 0)
                    gen_run.tokens_out = counters.get("tokens_out", 0)
                    gen_run.agent_trace = final_state.get("agent_trace")
                    gen_run.internal_trace = internal_trace_val
                    gen_run.result = None
                if p_run:
                    p_run.status = "failed_error"
                    p_run.current_step = "failed_error"
                    p_run.current_node = "failed_error"
                    p_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                    p_run.finished_at = finished_now
                    p_run.result = {"status": "failed_error", "error_detail": PLAIN_TECH_ERROR_MESSAGE}
                    p_run.trace = final_state.get("agent_trace")
                    p_run.internal_trace = internal_trace_val
                db.commit()
                return

            # Success: store clean draft and separate internal_trace
            if gen_run:
                gen_run.status = "succeeded"
                gen_run.current_step = "succeeded"
                gen_run.current_node = "succeeded"
                gen_run.finished_at = finished_now
                if gen_run.started_at:
                    gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                gen_run.round = final_state.get("round", 0)
                gen_run.search_calls = counters.get("search_calls", 0)
                gen_run.llm_calls = counters.get("llm_calls", 0)
                gen_run.tokens_in = counters.get("tokens_in", 0)
                gen_run.tokens_out = counters.get("tokens_out", 0)
                gen_run.result = final_state.get("draft")
                gen_run.best_draft = final_state.get("draft")
                gen_run.agent_trace = final_state.get("agent_trace")
                gen_run.internal_trace = internal_trace_val

            if p_run:
                p_run.status = "succeeded"
                p_run.current_step = "succeeded"
                p_run.current_node = "succeeded"
                p_run.finished_at = finished_now
                p_run.round = final_state.get("round", 0)
                p_run.result = final_state.get("draft")
                p_run.best_draft = final_state.get("draft")
                p_run.trace = final_state.get("agent_trace")
                p_run.internal_trace = internal_trace_val

            db.commit()
            duration_val = gen_run.duration if gen_run else '?'
            logger.info(f"Manual playground run {run_id} completed successfully in {duration_val}s")

    except Exception as exc:
        import traceback
        tb_summary = traceback.format_exc(limit=4)
        logger.exception(f"Manual playground run {run_id} encountered unexpected error: {exc}")
        finished_now = datetime.datetime.now(datetime.timezone.utc)
        try:
            with SessionLocal() as db:
                gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
                p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
                err_trace = {"exception": f"{type(exc).__name__}: {str(exc)[:200]}", "traceback": tb_summary}
                if gen_run:
                    gen_run.status = "failed_error"
                    gen_run.current_step = "failed_error"
                    gen_run.current_node = "error"
                    gen_run.error_code = "execution_exception"
                    gen_run.error_detail = PLAIN_TECH_ERROR_MESSAGE
                    gen_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                    gen_run.internal_trace = err_trace
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                if p_run:
                    p_run.status = "failed_error"
                    p_run.current_step = "failed_error"
                    p_run.current_node = "error"
                    p_run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                    p_run.internal_trace = err_trace
                    p_run.finished_at = finished_now
                    p_run.result = {
                        "status": "failed_error",
                        "error_detail": PLAIN_TECH_ERROR_MESSAGE,
                    }
                db.commit()
            # Emit run_failed event if not already emitted
            fail_emitter = RunEventEmitter(run_id=str(run_id), user_id=user_id, session_factory=SessionLocal)
            fail_emitter.emit_run_failed(PLAIN_TECH_ERROR_MESSAGE)
        except Exception as db_exc:
            logger.error(f"Failed to record run {run_id} exception to DB: {db_exc}")
    finally:
        release_manual_run_lock(user_id, run_id)


@router.post(
    "/runs",
    response_model=PlaygroundRunCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_playground_run(
    background_tasks: BackgroundTasks,
    payload: Optional[PlaygroundRunCreateRequest] = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Enqueues an experimental playground multi-agent run without generating posts or approvals.
    Rate-limited per user. Accepts optional topic_hint.
    Protected against double-clicks via in-flight Redis SET NX lock.
    If the locked run is not actively running in the database, ignores the stale lock and starts fresh.
    """
    # Rate limit: max 10 playground runs per minute per user
    enforce_rate_limit(f"playground:{user.id}", max_requests=10, window_seconds=60)

    new_run_id = uuid.uuid4()
    lock_ttl = settings.TOTAL_RUN_DEADLINE_SECONDS + 30

    # In-flight lock protection
    acquired, active_run_id = acquire_manual_run_lock(user.id, new_run_id, ttl_seconds=lock_ttl)
    if not acquired and active_run_id:
        existing_run = db.query(GenerationRun).filter(GenerationRun.id == active_run_id).first()
        is_active = False
        if existing_run and existing_run.status in ("queued", "running"):
            last_act = existing_run.last_progress_at or existing_run.started_at
            now_utc = datetime.datetime.now(datetime.timezone.utc)
            if last_act:
                if last_act.tzinfo is None:
                    last_act = last_act.replace(tzinfo=datetime.timezone.utc)
                age = (now_utc - last_act).total_seconds()
                if age <= settings.STALLED_PROGRESS_TIMEOUT_SECONDS:
                    is_active = True
                else:
                    logger.warning(f"Active run {active_run_id} is stalled (age: {age:.1f}s). Marking failed_error and ignoring lock.")
                    existing_run.status = "failed_error"
                    existing_run.error_reason = f"stalled at {existing_run.current_node or existing_run.current_step}"
                    db.commit()
                    release_manual_run_lock(user.id, active_run_id)

        if is_active and existing_run:
            logger.info(f"Manual run actively in flight for user {user.id} (active_run_id={active_run_id})")
            return PlaygroundRunCreateResponse(run_id=uuid.UUID(active_run_id), status=existing_run.status)

        # Stale lock: force release and re-acquire for new_run_id
        logger.info(f"Stale lock held by dead run {active_run_id}. Overriding with new run {new_run_id}")
        force_release_manual_run_lock(user.id)
        acquire_manual_run_lock(user.id, new_run_id, ttl_seconds=lock_ttl)

    today_local = datetime.datetime.now(datetime.timezone.utc).date()

    # 1. Insert fresh manual record into generation_runs
    gen_run = GenerationRun(
        id=new_run_id,
        user_id=user.id,
        run_date=today_local,
        run_type="manual",
        status="queued",
        current_step="queued",
        current_node="queued",
        boot_id=settings.BOOT_ID,
        last_progress_at=datetime.datetime.now(datetime.timezone.utc),
        round=0,
        search_provider=settings.SEARCH_PROVIDER,
    )
    db.add(gen_run)

    # 2. Insert record into playground_runs with matching id
    new_run = PlaygroundRun(
        id=new_run_id,
        user_id=user.id,
        status="queued",
        current_step="queued",
        current_node="queued",
        boot_id=settings.BOOT_ID,
        last_progress_at=datetime.datetime.now(datetime.timezone.utc),
        round=0,
    )
    db.add(new_run)
    db.commit()

    # Launch non-blocking background task
    topic_hint = payload.topic_hint if payload else None
    background_tasks.add_task(run_playground_pipeline_task, new_run_id, user.id, topic_hint)

    return PlaygroundRunCreateResponse(run_id=new_run_id, status="queued")


def _check_stuck_run_silence(run: PlaygroundRun, user_id: str, db: Session) -> tuple[str, bool]:
    """Marks a queued/running run as failed if no progress or events arrive for 2 minutes."""
    now = datetime.datetime.now(datetime.timezone.utc)
    status_val = run.status
    stalled = False

    if status_val in ("running", "queued"):
        last_act = run.last_progress_at or run.started_at or run.created_at
        if last_act:
            if last_act.tzinfo is None:
                last_act = last_act.replace(tzinfo=datetime.timezone.utc)
            inactivity_sec = (now - last_act).total_seconds()
            if inactivity_sec > STUCK_RUN_SILENCE_SECONDS:
                status_val = "failed_error"
                run.status = "failed_error"
                run.error_reason = PLAIN_TECH_ERROR_MESSAGE
                run.finished_at = now
                run.result = {
                    "status": "failed_error",
                    "error_detail": PLAIN_TECH_ERROR_MESSAGE,
                }
                # Append a terminal run_failed event so event pollers stop cleanly
                max_seq = (
                    db.query(RunEvent.seq)
                    .filter(RunEvent.run_id == run.id)
                    .order_by(RunEvent.seq.desc())
                    .limit(1)
                    .scalar()
                    or 0
                )
                db.add(
                    RunEvent(
                        run_id=run.id,
                        user_id=user_id,
                        seq=max_seq + 1,
                        created_at=now,
                        type="run_failed",
                        status="failed",
                        message=PLAIN_TECH_ERROR_MESSAGE,
                        payload={"message": PLAIN_TECH_ERROR_MESSAGE},
                    )
                )
                db.commit()
                release_manual_run_lock(user_id, run.id)
            elif inactivity_sec > settings.STALLED_WARNING_TIMEOUT_SECONDS:
                stalled = True

    return status_val, stalled


@router.get("/runs/active", response_model=Optional[PlaygroundRunDetail])
def get_active_playground_run(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Returns the user's currently active (queued/running) playground run if any,
    allowing the UI to resume polling immediately on reload.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    run = (
        db.query(PlaygroundRun)
        .filter(
            PlaygroundRun.user_id == user.id,
            PlaygroundRun.status.in_(["queued", "running"]),
        )
        .order_by(PlaygroundRun.created_at.desc())
        .first()
    )
    if not run:
        return None
    return get_playground_run(run.id, response, user, db)


@router.get("/runs/{run_id}", response_model=PlaygroundRunDetail)
def get_playground_run(
    run_id: uuid.UUID,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves public status, elapsed time, and final result for a playground run.
    Strictly isolated to current_user (404 otherwise). Never returns internal_trace.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    run = (
        db.query(PlaygroundRun)
        .filter(PlaygroundRun.id == run_id, PlaygroundRun.user_id == user.id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playground run not found",
        )

    now = datetime.datetime.now(datetime.timezone.utc)
    started = run.started_at
    if started and started.tzinfo is None:
        started = started.replace(tzinfo=datetime.timezone.utc)

    finished = run.finished_at
    if finished and finished.tzinfo is None:
        finished = finished.replace(tzinfo=datetime.timezone.utc)

    elapsed = round((finished - started).total_seconds(), 1) if (started and finished) else (
        round((now - started).total_seconds(), 1) if started else None
    )

    status_val, stalled = _check_stuck_run_silence(run, user.id, db)

    # Whitelisted public error text only (no raw errors or stack traces)
    public_error = PLAIN_TECH_ERROR_MESSAGE if status_val in ("failed_error", "failed", "timed_out") else None
    best_draft_val = getattr(run, "best_draft", None) or (
        run.result if isinstance(run.result, dict) and "post_text" in run.result else None
    )

    return PlaygroundRunDetail(
        id=run.id,
        status=status_val,
        current_step=run.current_step,
        current_node=run.current_node or run.current_step,
        round=run.round,
        max_rounds=MAX_ROUNDS,
        current_topic_index=getattr(run, "current_topic_index", 0) or 0,
        max_topics=getattr(settings, "MAX_TOPICS_PER_RUN", 4),
        current_round=getattr(run, "current_round", run.round or 0) or 0,
        max_rewrites=MAX_ROUNDS,
        best_draft=best_draft_val,
        failing_gates=[],
        elapsed_seconds=elapsed,
        last_progress_at=run.last_progress_at.isoformat() if run.last_progress_at else None,
        stalled=stalled,
        error_code="run_failed" if public_error else None,
        error_detail=public_error,
        error_reason=public_error,
        result=run.result if status_val in ("succeeded", "completed", "cancelled") else None,
        trace=run.trace,
        started_at=run.started_at.isoformat() if run.started_at else None,
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        created_at=run.created_at.isoformat(),
    )


@router.get("/runs/{run_id}/events", response_model=RunEventsResponse)
def get_playground_run_events(
    run_id: uuid.UUID,
    response: Response,
    after_seq: int = 0,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Returns public timeline events for a run after after_seq.
    Strictly checks that the signed-in user owns the run (404 otherwise).
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    run = (
        db.query(PlaygroundRun)
        .filter(PlaygroundRun.id == run_id, PlaygroundRun.user_id == user.id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playground run not found",
        )

    status_val, _ = _check_stuck_run_silence(run, user.id, db)

    rows = (
        db.query(RunEvent)
        .filter(RunEvent.run_id == run_id, RunEvent.seq > after_seq)
        .order_by(RunEvent.seq.asc())
        .all()
    )

    events = [
        RunEventPublic(
            seq=r.seq,
            time=r.created_at.isoformat() if r.created_at else "",
            type=r.type,
            agent=r.agent,
            status=r.status,
            message=r.message,
            payload=r.payload or {},
        )
        for r in rows
    ]
    last_seq = events[-1].seq if events else after_seq

    return RunEventsResponse(
        run_id=run.id,
        status=status_val,
        events=events,
        last_seq=last_seq,
    )


@router.post("/runs/{run_id}/cancel", response_model=PlaygroundCancelResponse)
def cancel_playground_run(
    run_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Requests cancellation of an active playground run.
    If a clean best draft already exists, keeps it available for the user.
    """
    run = (
        db.query(PlaygroundRun)
        .filter(PlaygroundRun.id == run_id, PlaygroundRun.user_id == user.id)
        .first()
    )
    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Playground run not found",
        )

    run.cancel_requested = True
    gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
    if gen_run:
        gen_run.cancel_requested = True

    if run.status in ("queued", "running"):
        run.status = "cancelled"
        run.finished_at = datetime.datetime.now(datetime.timezone.utc)
        if gen_run:
            gen_run.status = "cancelled"
            gen_run.finished_at = run.finished_at
        release_manual_run_lock(user.id, run.id)

    db.commit()
    return PlaygroundCancelResponse(
        run_id=run.id,
        status=run.status,
        best_draft=run.best_draft,
    )
