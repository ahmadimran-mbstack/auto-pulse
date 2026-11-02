import logging
import time
import uuid
from typing import Optional, Tuple, Union
from app.core.config import settings
from app.core.limiter import get_redis_client

logger = logging.getLogger(__name__)

# Fallback in-memory store: user_id -> (run_id_str, expires_at)
_IN_MEMORY_MANUAL_RUN_LOCKS: dict[str, tuple[str, float]] = {}
# Lock expires slightly after whole-run deadline (180s deadline + 30s buffer = 210s)
MANUAL_RUN_LOCK_TTL_SECONDS = settings.TOTAL_RUN_DEADLINE_SECONDS + 30


def acquire_manual_run_lock(
    user_id: str, run_id: Union[uuid.UUID, str], ttl_seconds: int = MANUAL_RUN_LOCK_TTL_SECONDS
) -> Tuple[bool, Optional[str]]:
    """Tries to atomically acquire an in-flight execution lock for a manual run.
    Guarantees:
    - Protects against double-clicks and concurrent executions per user.
    - Uses Redis SET NX with expiry when Redis is available.
    - Falls back to in-memory dictionary with timestamp expiry.
    - Returns (True, None) if lock was acquired.
    - Returns (False, active_run_id) if a manual run is already in flight.
    """
    lock_key = f"lock:manual_run:{user_id}"
    run_id_str = str(run_id)

    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            acquired = bool(redis_client.set(lock_key, run_id_str, nx=True, ex=ttl_seconds))
            if acquired:
                logger.info(f"Acquired Redis in-flight lock for user {user_id} (run_id={run_id})")
                return True, None
            # Already locked: retrieve active run ID
            val = redis_client.get(lock_key)
            active_id = val.decode("utf-8") if isinstance(val, bytes) else str(val) if val else None
            logger.info(f"Manual run lock already held for user {user_id} by run_id={active_id}")
            return False, active_id
        except Exception as exc:
            logger.warning(f"Redis lock check failed for {lock_key}: {exc}. Using in-memory fallback.")

    # In-memory fallback
    now = time.time()
    existing = _IN_MEMORY_MANUAL_RUN_LOCKS.get(user_id)
    if existing:
        active_id, expires_at = existing
        if now < expires_at:
            logger.info(f"In-memory manual run lock held for user {user_id} by run_id={active_id}")
            return False, active_id
        # Expired: clean up
        _IN_MEMORY_MANUAL_RUN_LOCKS.pop(user_id, None)

    _IN_MEMORY_MANUAL_RUN_LOCKS[user_id] = (run_id_str, now + ttl_seconds)
    logger.info(f"Acquired in-memory in-flight lock for user {user_id} (run_id={run_id})")
    return True, None


def release_manual_run_lock(user_id: str, run_id: Optional[Union[uuid.UUID, str]] = None) -> None:
    """Releases the in-flight manual run lock for the given user and run.
    If run_id is None, forcefully releases any active lock for the user.
    """
    lock_key = f"lock:manual_run:{user_id}"
    run_id_str = str(run_id) if run_id is not None else None

    redis_client = get_redis_client()
    if redis_client is not None:
        try:
            if run_id_str is None:
                redis_client.delete(lock_key)
                logger.info(f"Force-released Redis in-flight lock for user {user_id}")
            else:
                curr = redis_client.get(lock_key)
                curr_str = curr.decode("utf-8") if isinstance(curr, bytes) else str(curr) if curr else None
                if curr_str == run_id_str:
                    redis_client.delete(lock_key)
                    logger.info(f"Released Redis in-flight lock for user {user_id} (run_id={run_id})")
        except Exception as exc:
            logger.warning(f"Redis lock release failed for {lock_key}: {exc}")

    existing = _IN_MEMORY_MANUAL_RUN_LOCKS.get(user_id)
    if existing:
        if run_id_str is None or existing[0] == run_id_str:
            _IN_MEMORY_MANUAL_RUN_LOCKS.pop(user_id, None)
            logger.info(f"Released in-memory in-flight lock for user {user_id} (run_id={run_id_str or 'force'})")


def force_release_manual_run_lock(user_id: str) -> None:
    """Unconditionally releases the in-flight lock for a user."""
    release_manual_run_lock(user_id, run_id=None)

