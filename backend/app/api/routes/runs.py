import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.post import GenerationRun, PlaygroundRun
from app.schemas.post import GenerationRunDetail

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/{run_id}", response_model=GenerationRunDetail)
def get_generation_run(
    run_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves status, progress step, round, and multi-agent audit trace for a run (daily or playground).
    Strictly scoped to the current authenticated user.
    """
    # 1. Check generation_runs
    gen_run = (
        db.query(GenerationRun)
        .filter(GenerationRun.id == run_id, GenerationRun.user_id == user.id)
        .first()
    )
    if gen_run:
        status_val = "done" if gen_run.status in ("completed", "succeeded") else gen_run.status
        trace_data = gen_run.agent_trace
        return GenerationRunDetail(
            id=gen_run.id,
            status=status_val,
            current_step=gen_run.current_step,
            round=gen_run.round,
            max_rounds=settings.MAX_REWRITE_ROUNDS,
            trace=trace_data,
            agent_trace=trace_data,
            post_id=gen_run.post_id,
            result=gen_run.result,
            started_at=gen_run.started_at.isoformat() if gen_run.started_at else None,
            finished_at=gen_run.finished_at.isoformat() if gen_run.finished_at else None,
        )

    # 2. Check playground_runs
    p_run = (
        db.query(PlaygroundRun)
        .filter(PlaygroundRun.id == run_id, PlaygroundRun.user_id == user.id)
        .first()
    )
    if p_run:
        status_val = "done" if p_run.status == "completed" else p_run.status
        trace_data = p_run.trace
        return GenerationRunDetail(
            id=p_run.id,
            status=status_val,
            current_step=p_run.current_step,
            round=p_run.round,
            max_rounds=settings.MAX_REWRITE_ROUNDS,
            trace=trace_data,
            agent_trace=trace_data,
            result=p_run.result,
            started_at=p_run.started_at.isoformat() if p_run.started_at else None,
            finished_at=p_run.finished_at.isoformat() if p_run.finished_at else None,
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Run not found",
    )
