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
from app.models.post import GenerationRun, PlaygroundRun
from app.models.profile import Profile
from app.repositories import post as post_repo
from app.schemas.post import PlaygroundRunCreateRequest, PlaygroundRunCreateResponse, PlaygroundRunDetail
from app.services.content_profile import get_content_profile
from app.services.pipeline import execute_pipeline
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

            final_state = execute_pipeline(
                user_id=user_id,
                profile_dict=profile_dict,
                history=history,
                search_tool=search_tool,
                step_callback=_step_callback,
                topic_hint=topic_hint,
                is_manual=True,
                run_id=str(run_id),
            )

            counters = final_state.get("counters", {})
            err_code = final_state.get("error_code")
            state_status = final_state.get("status")
            finished_now = datetime.datetime.now(datetime.timezone.utc)

            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()

            if state_status == "timed_out" or err_code == "timed_out":
                timeout_detail = final_state.get("error_detail") or "Run exceeded execution time limits"
                if gen_run:
                    gen_run.status = "timed_out"
                    gen_run.current_step = "timed_out"
                    gen_run.current_node = final_state.get("current_step") or "timeout"
                    gen_run.error_code = "timed_out"
                    gen_run.error_detail = timeout_detail
                    gen_run.error_reason = timeout_detail
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                    gen_run.agent_trace = final_state.get("agent_trace")
                    gen_run.result = final_state.get("draft")
                if p_run:
                    p_run.status = "timed_out"
                    p_run.current_step = "timed_out"
                    p_run.current_node = final_state.get("current_step") or "timeout"
                    p_run.error_reason = timeout_detail
                    p_run.finished_at = finished_now
                    p_run.result = {
                        "status": "timed_out",
                        "error_code": "timed_out",
                        "error_detail": timeout_detail,
                        "draft": final_state.get("draft"),
                    }
                    p_run.trace = final_state.get("agent_trace")
                db.commit()
                logger.warning(f"Manual playground run {run_id} timed out: {timeout_detail}")
                return

            if state_status == "needs_review" or err_code == "needs_review":
                review_detail = final_state.get("error_detail") or "Post needs manual review"
                best_draft_val = final_state.get("best_draft") or final_state.get("draft")
                if gen_run:
                    gen_run.status = "needs_review"
                    gen_run.current_step = "needs_review"
                    gen_run.current_node = "needs_review"
                    gen_run.error_code = "needs_review"
                    gen_run.error_detail = review_detail
                    gen_run.error_reason = review_detail
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                    gen_run.best_draft = best_draft_val
                    gen_run.result = best_draft_val
                    gen_run.agent_trace = final_state.get("agent_trace")
                if p_run:
                    p_run.status = "needs_review"
                    p_run.current_step = "needs_review"
                    p_run.current_node = "needs_review"
                    p_run.error_reason = review_detail
                    p_run.finished_at = finished_now
                    p_run.best_draft = best_draft_val
                    p_run.result = best_draft_val
                    p_run.trace = final_state.get("agent_trace")
                db.commit()
                logger.info(f"Manual playground run {run_id} finished as needs_review: {review_detail}")
                return

            if err_code or state_status in ("failed_quality", "failed_error", "failed"):
                is_quality_failure = (state_status == "failed_quality" or err_code == "failed_quality")
                failed_status = "failed_quality" if is_quality_failure else "failed_error"
                err_code_val = err_code or ("failed_quality" if is_quality_failure else "pipeline_error")
                err_detail_val = final_state.get("error_detail") or "Run failed validation"

                if gen_run:
                    gen_run.status = failed_status
                    gen_run.current_step = failed_status
                    gen_run.current_node = failed_status
                    gen_run.error_code = err_code_val
                    gen_run.error_detail = err_detail_val
                    gen_run.error_reason = err_detail_val
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                    gen_run.search_calls = counters.get("search_calls", 0)
                    gen_run.llm_calls = counters.get("llm_calls", 0)
                    gen_run.tokens_in = counters.get("tokens_in", 0)
                    gen_run.tokens_out = counters.get("tokens_out", 0)
                    gen_run.agent_trace = final_state.get("agent_trace")
                    gen_run.result = final_state.get("draft")
                if p_run:
                    p_run.status = failed_status
                    p_run.current_step = failed_status
                    p_run.current_node = failed_status
                    p_run.error_reason = err_detail_val
                    p_run.finished_at = finished_now
                    p_run.result = {
                        "status": failed_status,
                        "error_code": err_code_val,
                        "error_detail": err_detail_val,
                        "draft": final_state.get("draft"),
                    }
                    p_run.trace = final_state.get("agent_trace")
                db.commit()
                return

            # Success
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
                gen_run.agent_trace = final_state.get("agent_trace")

            if p_run:
                p_run.status = "succeeded"
                p_run.current_step = "succeeded"
                p_run.current_node = "succeeded"
                p_run.finished_at = finished_now
                p_run.round = final_state.get("round", 0)
                p_run.result = final_state.get("draft")
                p_run.trace = final_state.get("agent_trace")

            db.commit()
            duration_val = gen_run.duration if gen_run else '?'
            logger.info(f"Manual playground run {run_id} completed successfully in {duration_val}s")

    except Exception as exc:
        import traceback
        tb_summary = traceback.format_exc(limit=4)
        logger.exception(f"Manual playground run {run_id} encountered unexpected error: {exc}")
        finished_now = datetime.datetime.now(datetime.timezone.utc)
        reason = f"{type(exc).__name__}: {str(exc)[:150]}"
        try:
            with SessionLocal() as db:
                gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
                p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
                if gen_run:
                    gen_run.status = "failed_error"
                    gen_run.current_step = "failed_error"
                    gen_run.current_node = "error"
                    gen_run.error_code = "execution_exception"
                    gen_run.error_detail = reason
                    gen_run.error_reason = f"{reason}\n{tb_summary}"
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                if p_run:
                    p_run.status = "failed_error"
                    p_run.current_step = "failed_error"
                    p_run.current_node = "error"
                    p_run.error_reason = f"{reason}\n{tb_summary}"
                    p_run.finished_at = finished_now
                    p_run.result = {
                        "status": "failed_error",
                        "error_code": "execution_exception",
                        "error_detail": reason,
                        "traceback": tb_summary,
                    }
                db.commit()
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


@router.get("/runs/{run_id}", response_model=PlaygroundRunDetail)
def get_playground_run(
    run_id: uuid.UUID,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves status, intermediate step, results, and full agent trace for a playground run.
    Strictly isolated to current_user. Sends Cache-Control: no-store.
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

    status_val = run.status
    stalled = False

    if status_val in ("running", "queued"):
        last_act = run.last_progress_at or run.started_at
        if last_act:
            if last_act.tzinfo is None:
                last_act = last_act.replace(tzinfo=datetime.timezone.utc)
            inactivity_sec = (now - last_act).total_seconds()
            if inactivity_sec > settings.STALLED_PROGRESS_TIMEOUT_SECONDS:
                node = run.current_node or run.current_step or "unknown"
                status_val = "timed_out"
                run.status = "timed_out"
                run.error_reason = f"Run timed out: stalled at {node}"
                run.finished_at = now
                run.result = {
                    "status": "timed_out",
                    "error_code": "stalled_execution",
                    "error_detail": f"Run timed out: stalled at {node}",
                }
                db.commit()
                release_manual_run_lock(user.id, run.id)
            elif inactivity_sec > settings.STALLED_WARNING_TIMEOUT_SECONDS:
                stalled = True

    err_code = (run.result or {}).get("error_code") if isinstance(run.result, dict) else None
    err_detail = (run.result or {}).get("error_detail") if isinstance(run.result, dict) else None

    failing_gates = []
    if isinstance(run.trace, dict):
        failing_gates = run.trace.get("final_check_failures") or []
    if not failing_gates and isinstance(run.result, dict):
        failing_gates = run.result.get("failing_gates") or []

    best_draft_val = getattr(run, "best_draft", None) or (
        (run.result or {}).get("draft") if isinstance(run.result, dict) else None
    )

    return PlaygroundRunDetail(
        id=run.id,
        status=status_val,
        current_step=run.current_step,
        current_node=run.current_node or run.current_step,
        round=run.round,
        max_rounds=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
        current_topic_index=getattr(run, "current_topic_index", 0) or 0,
        max_topics=getattr(settings, "MAX_TOPICS_PER_RUN", 4),
        current_round=getattr(run, "current_round", run.round or 0) or 0,
        max_rewrites=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
        best_draft=best_draft_val,
        failing_gates=failing_gates,
        elapsed_seconds=elapsed,
        last_progress_at=run.last_progress_at.isoformat() if run.last_progress_at else None,
        stalled=stalled,
        error_code=err_code,
        error_detail=err_detail,
        error_reason=run.error_reason or err_detail,
        result=run.result,
        trace=run.trace,
        started_at=run.started_at.isoformat() if run.started_at else None,
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        created_at=run.created_at.isoformat(),
    )


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
