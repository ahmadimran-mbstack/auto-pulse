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
from app.models.post import PlaygroundRun
from app.models.profile import Profile
from app.repositories import post as post_repo
from app.schemas.post import PlaygroundRunCreateResponse, PlaygroundRunDetail
from app.services.pipeline import execute_pipeline
from app.services.search import get_search_adapter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/playground", tags=["playground"])


def run_playground_pipeline_task(run_id: uuid.UUID, user_id: str, topic_hint: Optional[str] = None) -> None:
    """Background execution for an asynchronous playground run.
    Guarantees:
    - Atomically claims the queued run.
    - Never creates Post or Approval records.
    - Captures complete multi-agent trace and final draft result.
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
        db.commit()

        if not claimed_id:
            logger.info(f"Playground run {run_id} could not be claimed (already running or cancelled)")
            return

        try:
            profile = db.query(Profile).filter(Profile.user_id == user_id).first()
            history = post_repo.get_user_post_history(db, user_id, limit=30)
            search_tool = get_search_adapter(settings.SEARCH_PROVIDER)

            profile_dict = (
                {
                    "role_title": profile.role_title,
                    "industry": profile.industry,
                    "niche_description": profile.niche_description,
                    "audience": profile.audience,
                    "topics_include": profile.topics_include,
                    "topics_avoid": profile.topics_avoid,
                    "tone": profile.tone,
                    "voice_notes": profile.voice_notes,
                    "sample_posts": profile.sample_posts,
                }
                if profile
                else {}
            )

            def _step_callback(step_name: str, round_num: int, state: Dict[str, Any]):
                run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
                if run:
                    run.current_step = step_name
                    run.round = round_num

                    # Progressive intermediate trace persistence for real-time frontend updates
                    live_trace = dict(run.trace or {})
                    if state.get("finder_output"):
                        live_trace["finder"] = state.get("finder_output")
                    if state.get("gtm_brief"):
                        live_trace["gtm_brief"] = state.get("gtm_brief")
                    if state.get("rounds_history"):
                        live_trace["rounds"] = state.get("rounds_history")
                    if live_trace:
                        run.trace = live_trace

                    if state.get("draft"):
                        run.result = state.get("draft")

                    db.commit()

            final_state = execute_pipeline(
                user_id=user_id,
                profile_dict=profile_dict,
                history=history,
                search_tool=search_tool,
                step_callback=_step_callback,
                topic_hint=topic_hint,
            )

            err_code = final_state.get("error_code")
            run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
            if err_code:
                if run:
                    run.status = "failed"
                    run.current_step = "failed"
                    run.finished_at = datetime.datetime.now(datetime.timezone.utc)
                    run.result = {
                        "error_code": err_code,
                        "error_detail": final_state.get("error_detail"),
                    }
                    run.trace = final_state.get("agent_trace")
                    db.commit()
                return

            if run:
                run.status = "completed"
                run.current_step = "completed"
                run.finished_at = datetime.datetime.now(datetime.timezone.utc)
                run.round = final_state.get("round", 0)
                run.result = final_state.get("draft")
                run.trace = final_state.get("agent_trace")
                db.commit()
            logger.info(f"Playground run {run_id} completed successfully")

        except Exception as exc:
            logger.exception(f"Playground run {run_id} encountered unexpected error: {exc}")
            run = db.query(PlaygroundRun).filter(PlaygroundRun.id == run_id).first()
            if run:
                run.status = "failed"
                run.current_step = "error"
                run.finished_at = datetime.datetime.now(datetime.timezone.utc)
                run.result = {"error_code": "execution_exception", "error_detail": str(exc)[:250]}
                db.commit()


from app.schemas.post import PlaygroundRunCreateRequest, PlaygroundRunCreateResponse, PlaygroundRunDetail


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
    """
    # Rate limit: max 10 playground runs per minute per user
    enforce_rate_limit(f"playground:{user.id}", max_requests=10, window_seconds=60)

    # Insert queued run record
    new_run = PlaygroundRun(
        user_id=user.id,
        status="queued",
        current_step="queued",
        round=0,
    )
    db.add(new_run)
    db.commit()
    db.refresh(new_run)

    # Launch non-blocking background task
    topic_hint = payload.topic_hint if payload else None
    background_tasks.add_task(run_playground_pipeline_task, new_run.id, user.id, topic_hint)

    return PlaygroundRunCreateResponse(run_id=new_run.id, status=new_run.status)


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
