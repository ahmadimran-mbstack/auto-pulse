import hashlib
import math
import time
from typing import Dict, List, Tuple
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.limiter import get_redis_client

router = APIRouter(prefix="/auth", tags=["auth-limits"])

# In-memory fallback store used when Redis is disabled or unreachable
_otp_memory_windows: Dict[str, List[float]] = {}

OTP_COOLDOWN_SECONDS = 60
OTP_EMAIL_HOURLY_MAX = 5
OTP_IP_HOURLY_MAX = 20
HOUR_SECONDS = 3600


class OtpRateLimitRequest(BaseModel):
    email: str
    ip: str = "unknown"


# Hash identifiers with SHA-256 so raw emails and IPs are never stored in Redis keys
def _hash_key_part(value: str) -> str:
    return hashlib.sha256(value.strip().lower().encode("utf-8")).hexdigest()


# Read active timestamps in the window and compute seconds to wait if limit is reached
def _check_window(key: str, max_requests: int, window_seconds: int, now: float) -> int:
    cutoff = now - window_seconds
    client = get_redis_client()
    if client is not None:
        try:
            client.zremrangebyscore(key, 0, cutoff)
            entries = client.zrange(key, 0, -1, withscores=True)
            if len(entries) >= max_requests:
                oldest_score = float(entries[0][1])
                wait = max(1, math.ceil(oldest_score + window_seconds - now))
                return wait
            return 0
        except Exception:
            pass

    timestamps = [ts for ts in _otp_memory_windows.get(key, []) if ts > cutoff]
    _otp_memory_windows[key] = timestamps
    if len(timestamps) >= max_requests:
        wait = max(1, math.ceil(timestamps[0] + window_seconds - now))
        return wait
    return 0


# Record a successful OTP send timestamp in Redis or in-memory fallback
def _record_hit(key: str, window_seconds: int, now: float) -> None:
    client = get_redis_client()
    if client is not None:
        try:
            pipe = client.pipeline()
            pipe.zadd(key, {f"{now}": now})
            pipe.expire(key, window_seconds + 10)
            pipe.execute()
            return
        except Exception:
            pass

    _otp_memory_windows.setdefault(key, []).append(now)


# Enforce 60s email cooldown, 5/hour per email, and 20/hour per IP before sending an OTP
@router.post("/otp-rate-limit")
def check_otp_rate_limit(payload: OtpRateLimitRequest):
    email_clean = payload.email.strip().lower()
    if not email_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_email", "message": "Email is required."},
        )

    email_hash = _hash_key_part(email_clean)
    ip_hash = _hash_key_part(payload.ip or "unknown")
    now = time.time()

    checks: List[Tuple[str, int, int]] = [
        (f"otp:cooldown:{email_hash}", 1, OTP_COOLDOWN_SECONDS),
        (f"otp:email_hour:{email_hash}", OTP_EMAIL_HOURLY_MAX, HOUR_SECONDS),
        (f"otp:ip_hour:{ip_hash}", OTP_IP_HOURLY_MAX, HOUR_SECONDS),
    ]

    # Check all limits first so a blocked attempt does not consume quota
    max_wait = 0
    for key, limit, window in checks:
        wait = _check_window(key, limit, window, now)
        if wait > max_wait:
            max_wait = wait

    if max_wait > 0:
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(max_wait)},
            content={
                "code": "rate_limited",
                "message": f"Please wait {max_wait} seconds before requesting another code.",
                "retry_after": max_wait,
            },
        )

    # Record the send across all three windows once all checks pass
    for key, _, window in checks:
        _record_hit(key, window, now)

    return {"allowed": True, "cooldown_seconds": OTP_COOLDOWN_SECONDS}

