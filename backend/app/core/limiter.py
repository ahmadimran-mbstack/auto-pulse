import logging
import time
from typing import Dict, List, Optional
from fastapi import HTTPException, status
import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None
_in_memory_fallback: Dict[str, List[float]] = {}


def get_redis_client() -> Optional[redis.Redis]:
    global _redis_client
    if not settings.REDIS_ENABLED or not settings.REDIS_URL:
        return None
    if _redis_client is None:
        try:
            _redis_client = redis.Redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_timeout=2.0,
            )
            _redis_client.ping()
        except Exception as exc:
            logger.warning(f"Could not connect to Redis: {exc}. Using in-memory rate limiting fallback.")
            _redis_client = None
    return _redis_client


def is_rate_limited(
    key: str,
    max_requests: int,
    window_seconds: int = 60,
) -> bool:
    """
    Returns True if request exceeds max_requests in window_seconds, False if allowed.
    Uses Redis when available, falls back to in-memory sliding window.
    """
    client = get_redis_client()
    if client is not None:
        try:
            # Atomic sliding-window rate limiter via Redis sorted set or fixed window with expire
            now = time.time()
            pipe = client.pipeline()
            pipe.zremrangebyscore(key, 0, now - window_seconds)
            pipe.zadd(key, {str(now): now})
            pipe.zcard(key)
            pipe.expire(key, window_seconds + 5)
            results = pipe.execute()
            count = results[2]
            return count > max_requests
        except Exception as exc:
            logger.warning(f"Redis rate limit check error: {exc}. Falling back to in-memory.")

    # In-memory sliding window fallback
    now = time.time()
    cutoff = now - window_seconds
    timestamps = _in_memory_fallback.setdefault(key, [])
    # Prune old timestamps
    _in_memory_fallback[key] = [ts for ts in timestamps if ts > cutoff]
    if len(_in_memory_fallback[key]) >= max_requests:
        return True
    _in_memory_fallback[key].append(now)
    return False


def enforce_rate_limit(
    key: str,
    max_requests: int,
    window_seconds: int = 60,
    error_message: Optional[str] = None,
) -> None:
    """Enforces rate limit by raising HTTP 429 with Retry-After and categorized error."""
    if is_rate_limited(key, max_requests, window_seconds):
        from app.services.run_errors import (
            ERROR_CATEGORY_RATE_LIMITED,
            format_rate_limited_message,
        )

        msg = error_message or format_rate_limited_message(window_seconds)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(window_seconds)},
            detail={
                "code": "rate_limited",
                "error_category": ERROR_CATEGORY_RATE_LIMITED,
                "message": msg,
                "retry_after": window_seconds,
            },
        )
