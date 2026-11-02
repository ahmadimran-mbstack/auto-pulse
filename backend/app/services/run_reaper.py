import logging
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.services.run_lock import release_manual_run_lock

logger = logging.getLogger(__name__)


def cleanup_interrupted_runs_on_startup(db: Session, current_boot_id: str) -> int:
    """Atomically marks every run in 'running' or 'queued' that belongs to a different boot_id
    as 'interrupted', and releases their in-flight locks.
    Guarantees no dead runs survive process restarts or deployments.
    """
    total_cleaned = 0
    try:
        # 1. Update generation_runs
        stmt_gen = text(
            "UPDATE generation_runs "
            "SET status = 'interrupted', "
            "    error_reason = 'Process restarted or redeployed during execution', "
            "    finished_at = now() "
            "WHERE status IN ('running', 'queued') "
            "  AND (boot_id IS NULL OR boot_id != :boot_id) "
            "RETURNING id, user_id"
        )
        res_gen = db.execute(stmt_gen, {"boot_id": current_boot_id}).fetchall()

        # 2. Update playground_runs
        stmt_p = text(
            "UPDATE playground_runs "
            "SET status = 'interrupted', "
            "    error_reason = 'Process restarted or redeployed during execution', "
            "    result = jsonb_build_object('status', 'interrupted', 'error_detail', 'Process restarted or redeployed during execution'), "
            "    finished_at = now() "
            "WHERE status IN ('running', 'queued') "
            "  AND (boot_id IS NULL OR boot_id != :boot_id) "
            "RETURNING id, user_id"
        )
        res_p = db.execute(stmt_p, {"boot_id": current_boot_id}).fetchall()
        db.commit()

        seen_locks = set()
        for row in res_gen + res_p:
            run_id = row[0]
            user_id = row[1]
            lock_pair = (str(user_id), str(run_id))
            if lock_pair not in seen_locks:
                seen_locks.add(lock_pair)
                release_manual_run_lock(user_id, run_id)

        total_cleaned = len(res_gen) + len(res_p)
        if total_cleaned > 0:
            logger.info(f"Startup sweep: marked {total_cleaned} orphan runs as interrupted (boot_id={current_boot_id})")
    except Exception as exc:
        db.rollback()
        logger.error(f"Failed to cleanup interrupted runs on startup: {exc}", exc_info=True)

    return total_cleaned


def reap_stalled_runs(db: Session, stall_threshold_seconds: Optional[int] = None) -> int:
    """Periodic reaper running in the always-on backend.
    Marks runs with no progress for `stall_threshold_seconds` (default STALL_SECONDS=180)
    as 'timed_out' with reason 'Run timed out: stalled at <current_node>' and releases their locks.
    Atomic UPDATE with condition in WHERE ensures two concurrent reapers cannot conflict.
    """
    if stall_threshold_seconds is None:
        stall_threshold_seconds = getattr(settings, "STALL_SECONDS", 180)

    total_reaped = 0
    try:
        # 1. Reap generation_runs
        stmt_gen = text(
            "UPDATE generation_runs "
            "SET status = 'timed_out', "
            "    error_code = 'timed_out', "
            "    error_detail = 'Run timed out: stalled at ' || COALESCE(current_node, current_step, 'unknown'), "
            "    error_reason = 'Run timed out: stalled at ' || COALESCE(current_node, current_step, 'unknown'), "
            "    finished_at = now() "
            "WHERE status IN ('running', 'queued') "
            "  AND ( "
            "      (last_progress_at IS NOT NULL AND last_progress_at < now() - (:stall_sec || ' seconds')::interval) "
            "      OR "
            "      (last_progress_at IS NULL AND started_at < now() - (:stall_sec || ' seconds')::interval) "
            "  ) "
            "RETURNING id, user_id, current_node"
        )
        res_gen = db.execute(stmt_gen, {"stall_sec": stall_threshold_seconds}).fetchall()

        # 2. Reap playground_runs
        stmt_p = text(
            "UPDATE playground_runs "
            "SET status = 'timed_out', "
            "    error_reason = 'Run timed out: stalled at ' || COALESCE(current_node, current_step, 'unknown'), "
            "    result = jsonb_build_object( "
            "        'status', 'timed_out', "
            "        'error_code', 'stalled_execution', "
            "        'error_detail', 'Run timed out: stalled at ' || COALESCE(current_node, current_step, 'unknown') "
            "    ), "
            "    finished_at = now() "
            "WHERE status IN ('running', 'queued') "
            "  AND ( "
            "      (last_progress_at IS NOT NULL AND last_progress_at < now() - (:stall_sec || ' seconds')::interval) "
            "      OR "
            "      (last_progress_at IS NULL AND started_at < now() - (:stall_sec || ' seconds')::interval) "
            "  ) "
            "RETURNING id, user_id, current_node"
        )
        res_p = db.execute(stmt_p, {"stall_sec": stall_threshold_seconds}).fetchall()
        db.commit()

        seen_locks = set()
        for row in res_gen + res_p:
            run_id = row[0]
            user_id = row[1]
            node = row[2] if len(row) > 2 else "unknown"
            lock_pair = (str(user_id), str(run_id))
            if lock_pair not in seen_locks:
                seen_locks.add(lock_pair)
                release_manual_run_lock(user_id, run_id)
            logger.warning(f"Reaper marked run {run_id} as timed_out: stalled at {node}")

        total_reaped = len(res_gen) + len(res_p)
    except Exception as exc:
        db.rollback()
        logger.error(f"Error during periodic run reaper: {exc}", exc_info=True)

    return total_reaped

