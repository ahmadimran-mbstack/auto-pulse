import datetime
import logging
from typing import Any, Dict, Optional
import uuid
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
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
from app.services.run_lock import acquire_manual_run_lock, release_manual_run_lock
from app.services.search import get_search_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playground", tags=["playground"])


def run_playground_pipeline_task(run_id: uuid.UUID, user_id: str, topic_hint: Optional[str] = None) -> None:
    """Background execution for an asynchronous playground run.
    Guarantees:
    - Atomically claims the queued run across generation_runs and playground_runs.
    - Never creates Post or Approval records.
    - Captures complete multi-agent trace, nonzero token metrics, and final draft result.
    - Releases in-flight double-click lock upon finish.
    """
    with SessionLocal() as db:
        # Atomic claim: UPDATE playground_runs WHERE status = 'queued' RETURNING id
        claim_stmt = text(
            "UPDATE playground_runs "
            "SET status = 'running', started_at = now() "
            "WHERE id = :id AND status = 'queued' "
            "RETURNING id"
        )
        claimed_id = db.execute(claim_stmt, {"id": run_id}).scalar_one_or_none()
        if claimed_id:
            db.execute(
                text("UPDATE generation_runs SET status = 'running', started_at = now() WHERE id = :id AND status = 'queued'"),
                {"id": run_id},
            )
            db.commit()
        else:
            logger.info(f"Playground run {run_id} could not be claimed (already running or cancelled)")
            release_manual_run_lock(user_id, run_id)
            return

        try:
            # Ensure generation_runs record exists for this manual run
            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            if not gen_run:
                gen_run = GenerationRun(
                    id=run_id,
                    user_id=user_id,
                    run_date=datetime.datetime.now(datetime.timezone.utc).date(),
                    run_type="manual",
                    status="running",
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

                live_trace = dict((gen_run.agent_trace if gen_run else None) or {})
                if state.get("finder_output"):
                    live_trace["finder"] = state.get("finder_output")
                if state.get("gtm_brief"):
                    live_trace["gtm_brief"] = state.get("gtm_brief")
                if state.get("rounds_history"):
                    live_trace["rounds"] = state.get("rounds_history")

                draft_res = state.get("draft")

                if gen_run:
                    gen_run.current_step = step_name
                    gen_run.round = round_num
                    if live_trace:
                        gen_run.agent_trace = live_trace
                    if draft_res:
                        gen_run.result = draft_res

                if p_run:
                    p_run.current_step = step_name
                    p_run.round = round_num
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
            finished_now = datetime.datetime.now(datetime.timezone.utc)

            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()

            if err_code:
                if gen_run:
                    gen_run.status = "failed"
                    gen_run.current_step = "failed"
                    gen_run.error_code = err_code
                    gen_run.error_detail = final_state.get("error_detail")
                    gen_run.finished_at = finished_now
                    if gen_run.started_at:
                        gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
                    gen_run.search_calls = counters.get("search_calls", 0)
                    gen_run.llm_calls = counters.get("llm_calls", 0)
                    gen_run.tokens_in = counters.get("tokens_in", 0)
                    gen_run.tokens_out = counters.get("tokens_out", 0)
                    gen_run.agent_trace = final_state.get("agent_trace")
                if p_run:
                    p_run.status = "failed"
                    p_run.current_step = "failed"
                    p_run.finished_at = finished_now
                    p_run.result = {"error_code": err_code, "error_detail": final_state.get("error_detail")}
                    p_run.trace = final_state.get("agent_trace")
                db.commit()
                return

            if gen_run:
                gen_run.status = "completed"
                gen_run.current_step = "completed"
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
                p_run.status = "completed"
                p_run.current_step = "completed"
                p_run.finished_at = finished_now
                p_run.round = final_state.get("round", 0)
                p_run.result = final_state.get("draft")
                p_run.trace = final_state.get("agent_trace")

            db.commit()
            duration_val = gen_run.duration if gen_run else '?'
            logger.info(f"Manual playground run {run_id} completed successfully in {duration_val}s")

        except Exception as exc:
            logger.exception(f"Manual playground run {run_id} encountered unexpected error: {exc}")
            finished_now = datetime.datetime.now(datetime.timezone.utc)
            gen_run = db.query(GenerationRun).filter(GenerationRun.id == run_id).first()
            p_run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
            if gen_run:
                gen_run.status = "failed"
                gen_run.current_step = "error"
                gen_run.error_code = "execution_exception"
                gen_run.error_detail = str(exc)[:250]
                gen_run.finished_at = finished_now
                if gen_run.started_at:
                    gen_run.duration = round((finished_now - gen_run.started_at).total_seconds(), 2)
            if p_run:
                p_run.status = "failed"
                p_run.current_step = "error"
                p_run.finished_at = finished_now
                p_run.result = {"error_code": "execution_exception", "error_detail": str(exc)[:250]}
            db.commit()
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
    Always creates a NEW run with a new run_id and new thread_id.
    Protected against double-clicks via in-flight Redis SET NX lock.
    """
    # Rate limit: max 10 playground runs per minute per user
    enforce_rate_limit(f"playground:{user.id}", max_requests=10, window_seconds=60)

    new_run_id = uuid.uuid4()

    # In-flight lock protection: if already running, return that run's id and status
    acquired, active_run_id = acquire_manual_run_lock(user.id, new_run_id, ttl_seconds=300)
    if not acquired and active_run_id:
        logger.info(f"Manual run already in flight for user {user.id} (active_run_id={active_run_id})")
        existing_run = db.query(GenerationRun).filter(GenerationRun.id == active_run_id).first()
        status_val = existing_run.status if existing_run else "running"
        return PlaygroundRunCreateResponse(run_id=uuid.UUID(active_run_id), status=status_val)

    today_local = datetime.datetime.now(datetime.timezone.utc).date()

    # 1. Insert fresh manual record into generation_runs
    gen_run = GenerationRun(
        id=new_run_id,
        user_id=user.id,
        run_date=today_local,
        run_type="manual",
        status="queued",
        current_step="queued",
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
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves status, intermediate step, results, and full agent trace for a playground run.
    Strictly isolated to current_user.
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

    return PlaygroundRunDetail(
        id=run.id,
        status=run.status,
        current_step=run.current_step,
        round=run.round,
        result=run.result,
        trace=run.trace,
        started_at=run.started_at.isoformat() if run.started_at else None,
        finished_at=run.finished_at.isoformat() if run.finished_at else None,
        created_at=run.created_at.isoformat(),
    )
