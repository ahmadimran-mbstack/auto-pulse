import datetime
import uuid
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.post import GenerationRun, PlaygroundRun
from app.schemas.post import GenerationRunDetail
from app.services.run_lock import release_manual_run_lock

router = APIRouter(prefix="/runs", tags=["runs"])


def _check_and_normalize_liveness(run: GenerationRun | PlaygroundRun, user_id: str, db: Session) -> tuple[str, bool, float | None]:
    """Evaluates run liveness, elapsed time, and stalls.
    Guarantees:
    - Never returns 'running' for a run the reaper would clear (>90s stalled).
    - Sets stalled=True when no progress for >60s.
    - Accurately computes elapsed_seconds.
    """
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
                # Run is dead: reaper would clear it. Mark timed_out and release lock.
                node = getattr(run, "current_node", None) or getattr(run, "current_step", None) or "unknown"
                status_val = "timed_out"
                run.status = "timed_out"
                run.error_reason = f"Run timed out: stalled at {node}"
                run.finished_at = now
                if hasattr(run, "error_code"):
                    run.error_code = "timed_out"
                    run.error_detail = f"Run timed out: stalled at {node}"
                if hasattr(run, "result") and isinstance(run.result, dict):
                    res_dict = dict(run.result)
                    res_dict["status"] = "timed_out"
                    res_dict["error_detail"] = f"Run timed out: stalled at {node}"
                    run.result = res_dict
                db.commit()
                release_manual_run_lock(user_id, run.id)
            elif inactivity_sec > settings.STALLED_WARNING_TIMEOUT_SECONDS:
                stalled = True

    if status_val in ("completed", "succeeded"):
        status_val = "succeeded"

    return status_val, stalled, elapsed


@router.get("/{run_id}", response_model=GenerationRunDetail)
def get_generation_run(
    run_id: uuid.UUID,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves status, progress step, round, and multi-agent audit trace for a run (daily or playground).
    Strictly scoped to the current authenticated user. Sends Cache-Control: no-store.
    """
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

    # 1. Check generation_runs
    gen_run = (
        db.query(GenerationRun)
        .filter(GenerationRun.id == run_id, GenerationRun.user_id == user.id)
        .first()
    )
    if gen_run:
        status_val, stalled, elapsed = _check_and_normalize_liveness(gen_run, user.id, db)
        trace_data = gen_run.agent_trace
        failing_gates = []
        if isinstance(trace_data, dict):
            failing_gates = trace_data.get("final_check_failures") or []

        return GenerationRunDetail(
            id=gen_run.id,
            status=status_val,
            current_step=gen_run.current_step,
            current_node=gen_run.current_node or gen_run.current_step,
            round=gen_run.round,
            max_rounds=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
            current_topic_index=getattr(gen_run, "current_topic_index", 0) or 0,
            max_topics=getattr(settings, "MAX_TOPICS_PER_RUN", 4),
            current_round=getattr(gen_run, "current_round", gen_run.round or 0) or 0,
            max_rewrites=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
            best_draft=getattr(gen_run, "best_draft", None),
            failing_gates=failing_gates,
            elapsed_seconds=elapsed,
            last_progress_at=gen_run.last_progress_at.isoformat() if gen_run.last_progress_at else None,
            stalled=stalled,
            error_code=gen_run.error_code,
            error_detail=gen_run.error_detail,
            error_reason=gen_run.error_reason or gen_run.error_detail,
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
        status_val, stalled, elapsed = _check_and_normalize_liveness(p_run, user.id, db)
        trace_data = p_run.trace
        err_code = (p_run.result or {}).get("error_code") if isinstance(p_run.result, dict) else None
        err_detail = (p_run.result or {}).get("error_detail") if isinstance(p_run.result, dict) else None
        failing_gates = []
        if isinstance(trace_data, dict):
            failing_gates = trace_data.get("final_check_failures") or []

        return GenerationRunDetail(
            id=p_run.id,
            status=status_val,
            current_step=p_run.current_step,
            current_node=p_run.current_node or p_run.current_step,
            round=p_run.round,
            max_rounds=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
            current_topic_index=getattr(p_run, "current_topic_index", 0) or 0,
            max_topics=getattr(settings, "MAX_TOPICS_PER_RUN", 4),
            current_round=getattr(p_run, "current_round", p_run.round or 0) or 0,
            max_rewrites=getattr(settings, "MAX_REWRITES_PER_TOPIC", 4),
            best_draft=getattr(p_run, "best_draft", None),
            failing_gates=failing_gates,
            elapsed_seconds=elapsed,
            last_progress_at=p_run.last_progress_at.isoformat() if p_run.last_progress_at else None,
            stalled=stalled,
            error_code=err_code,
            error_detail=err_detail,
            error_reason=p_run.error_reason or err_detail,
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


@router.get("/{run_id}/trace")
def get_run_trace(
    run_id: uuid.UUID,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Retrieves full per-node audit trace, candidate evaluation, extracted facts,
    and gate verification results for a generation or playground run.
    Strictly scoped to the current authenticated creator.
    """
    gen_run = (
        db.query(GenerationRun)
        .filter(GenerationRun.id == run_id, GenerationRun.user_id == user.id)
        .first()
    )
    if gen_run:
        status_val = "done" if gen_run.status in ("completed", "succeeded") else gen_run.status
        return {
            "run_id": str(gen_run.id),
            "status": status_val,
            "error_code": gen_run.error_code,
            "error_detail": gen_run.error_detail,
            "agent_trace": gen_run.agent_trace or {},
            "trace": gen_run.agent_trace or {},
            "result": gen_run.result,
        }

    p_run = (
        db.query(PlaygroundRun)
        .filter(PlaygroundRun.id == run_id, PlaygroundRun.user_id == user.id)
        .first()
    )
    if p_run:
        status_val = "done" if p_run.status == "completed" else p_run.status
        return {
            "run_id": str(p_run.id),
            "status": status_val,
            "agent_trace": p_run.trace or {},
            "trace": p_run.trace or {},
            "result": p_run.result,
        }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Run not found",
    )
