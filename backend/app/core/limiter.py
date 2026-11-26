import logging
import math
import time
from typing import Callable, Dict, List, Optional, Tuple
from fastapi import Depends, HTTPException, Request, Response, status
import redis
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.plans import (
    PLAN_RATE_LIMITS,
    RATE_LIMIT_WINDOWS,
    get_plan_rate_limit_tier,
    get_plans,
    get_purchasable_plan_ids,
)
from app.db.session import get_db

logger = logging.getLogger(__name__)

_redis_client: Optional[redis.Redis] = None
_in_memory_fallback: Dict[str, List[float]] = {}
_in_memory_fixed_windows: Dict[str, int] = {}


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


def _next_upgrade_plan_id(plan_id: str) -> Optional[str]:
    purchasable = list(get_purchasable_plan_ids())
    if plan_id == "internal":
        return None
    if plan_id in purchasable:
        idx = purchasable.index(plan_id)
        return purchasable[idx + 1] if idx + 1 < len(purchasable) else None
    return purchasable[0] if purchasable else None


def _fixed_window_check(
    bucket: str,
    subject_id: str,
    max_requests: int,
    window_seconds: int,
) -> Tuple[bool, int, int, int]:
    """Increment Redis fixed-window counter rl:{bucket}:{subject_id}:{window}.

    Falls back to in-memory fixed-window counting when Redis is unavailable.
    Returns (allowed, remaining, retry_after_seconds, redis_available_flag).
    """
    now = int(time.time())
    window_idx = now // window_seconds
    retry_after = max(1, (window_idx + 1) * window_seconds - now)
    key = f"rl:{bucket}:{subject_id}:{window_idx}"

    client = get_redis_client()
    if client is not None:
        try:
            count = int(client.incr(key))
            if count == 1:
                client.expire(key, window_seconds)
            remaining = max(0, max_requests - count)
            allowed = count <= max_requests
            return allowed, remaining, retry_after, 1
        except Exception as exc:
            logger.warning(f"Redis rate limit error for {key}: {exc}")

    # In-memory fixed-window fallback when Redis is disabled or unreachable
    if len(_in_memory_fixed_windows) > 5000:
        _in_memory_fixed_windows.clear()
    count = _in_memory_fixed_windows.get(key, 0) + 1
    _in_memory_fixed_windows[key] = count
    remaining = max(0, max_requests - count)
    allowed = count <= max_requests
    return allowed, remaining, retry_after, 0


def _raise_plan_429(
    plan_id: str,
    plan_name: str,
    retry_after: int,
    limit: int,
    remaining: int,
) -> None:
    mins = max(1, math.ceil(retry_after / 60))
    unit = "minute" if mins == 1 else "minutes"
    upgrade_to = _next_upgrade_plan_id(plan_id)
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        headers={
            "Retry-After": str(retry_after),
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(remaining),
        },
        detail={
            "code": "rate_limited",
            "error_category": "rate_limited",
            "message": f"You are generating too fast on the {plan_name} plan. Try again in {mins} {unit}.",
            "retry_after": retry_after,
            "upgrade_to": upgrade_to,
        },
    )


def rate_limit(bucket: str) -> Callable[..., None]:
    """FastAPI dependency enforcing plan-based fixed-window rate limits for a bucket."""
    window_seconds = RATE_LIMIT_WINDOWS.get(bucket, 60)
    limits_map = PLAN_RATE_LIMITS.get(bucket, {})

    def _dependency(
        request: Request,
        response: Response,
        user: User = Depends(current_user),
        db: Session = Depends(get_db),
    ) -> None:
        from app.services.entitlements import get_effective_plan

        eff = get_effective_plan(db, user.id)
        plan_id = eff["plan_id"]
        eff_status = eff["status"]
        plans_map = get_plans()
        plan_cfg = plans_map.get(plan_id) or plans_map["trial"]
        rate_tier = get_plan_rate_limit_tier(plan_id)

        if eff_status == "expired":
            if bucket == "generate":
                purchasable = get_purchasable_plan_ids()
                first_paid = purchasable[0] if purchasable else "starter"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "code": "plan_expired",
                        "error_category": "plan_expired",
                        "message": "Your plan has ended. Upgrade to continue.",
                        "upgrade_to": first_paid if plan_id == "trial" else plan_id,
                    },
                )
            limit = int(limits_map.get("expired") or limits_map.get("trial") or 30)
        else:
            limit = int(limits_map.get(rate_tier) or limits_map.get("trial") or 30)

        allowed, remaining, retry_after, redis_ok = _fixed_window_check(
            bucket=bucket,
            subject_id=user.id,
            max_requests=limit,
            window_seconds=window_seconds,
        )

        if not redis_ok:
            if bucket == "generate":
                logger.warning(f"Redis down during 'generate' rate limit for {user.id}; checking DB daily limit + in-memory fallback")
                from app.services.quota import get_user_usage_counts
                from app.services.entitlements import ensure_trial_subscription
                sub = ensure_trial_subscription(db, user.id)
                counts = get_user_usage_counts(db, user.id, sub)
                daily_lim = plan_cfg.playground_runs_per_day
                if daily_lim is not None and counts["playground_today_used"] >= daily_lim:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        headers={"Retry-After": "3600"},
                        detail={
                            "code": "rate_limited",
                            "error_category": "rate_limited",
                            "message": f"Daily limit reached on the {plan_cfg.name} plan. Try again tomorrow.",
                            "upgrade_to": _next_upgrade_plan_id(plan_id),
                        },
                    )
            else:
                logger.warning(f"Redis down during '{bucket}' rate limit for {user.id}; using in-memory fallback")
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            request.state.rate_limit_headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(remaining),
            }
            if not allowed:
                _raise_plan_429(plan_id, plan_cfg.name, retry_after, limit, remaining)
            return

        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        request.state.rate_limit_headers = {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(remaining),
        }

        if not allowed:
            _raise_plan_429(plan_id, plan_cfg.name, retry_after, limit, remaining)

    return _dependency


def public_rate_limit(bucket: str = "public") -> Callable[..., None]:
    """FastAPI dependency enforcing IP-based fixed-window rate limits for public routes."""
    window_seconds = RATE_LIMIT_WINDOWS.get(bucket, 60)
    limit = int(PLAN_RATE_LIMITS.get(bucket, {}).get("default") or 60)

    def _dependency(request: Request, response: Response) -> None:
        forwarded = request.headers.get("x-forwarded-for", "")
        ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
        allowed, remaining, retry_after, redis_ok = _fixed_window_check(
            bucket=bucket,
            subject_id=ip,
            max_requests=limit,
            window_seconds=window_seconds,
        )
        if not redis_ok:
            logger.warning(f"Redis down during '{bucket}' rate limit for IP {ip}; failing open")
            response.headers["X-RateLimit-Limit"] = str(limit)
            response.headers["X-RateLimit-Remaining"] = str(limit)
            request.state.rate_limit_headers = {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(limit),
            }
            return

        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        request.state.rate_limit_headers = {
            "X-RateLimit-Limit": str(limit),
            "X-RateLimit-Remaining": str(remaining),
        }
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": str(remaining),
                },
                detail={
                    "code": "rate_limited",
                    "error_category": "rate_limited",
                    "message": "Too many requests. Please try again in a minute.",
                    "retry_after": retry_after,
                },
            )

    return _dependency
