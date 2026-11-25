"""Account status lookup, Redis caching, and 403 enforcement."""

import logging
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.limiter import get_redis_client
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

ACCOUNT_STATUS_CACHE_TTL = 60

_STATUS_CODE_MAP = {
    "suspended": (
        "ACCOUNT_SUSPENDED",
        "Your account has been suspended. Please contact support.",
    ),
    "disabled": (
        "ACCOUNT_DISABLED",
        "Your account has been disabled. Please contact support.",
    ),
    "deleted": (
        "ACCOUNT_DELETED",
        "This account has been deleted. Please contact support.",
    ),
}


def _status_cache_key(user_id: str) -> str:
    return f"account_status:{user_id}"


def invalidate_user_status_cache(user_id: str) -> None:
    """Clear the cached account status for user_id immediately after any status change or delete."""
    client = get_redis_client()
    if client is not None:
        try:
            client.delete(_status_cache_key(user_id))
        except Exception as exc:
            logger.warning(f"Failed to invalidate account status cache for {user_id}: {exc}")


def get_user_account_status(
    db: Optional[Session],
    user_id: str,
    email: Optional[str] = None,
    bypass_cache: bool = False,
) -> str:
    """Return 'active', 'suspended', 'disabled', or 'deleted'. Missing profile means 'active'."""
    client = get_redis_client()
    cache_key = _status_cache_key(user_id)
    if not bypass_cache and client is not None:
        try:
            cached = client.get(cache_key)
            if cached in ("active", "suspended", "disabled", "deleted"):
                return str(cached)
        except Exception as exc:
            logger.warning(f"Redis read failed for {cache_key}: {exc}")

    own_db = False
    if db is None:
        from app.core.config import settings
        if "fakeuser" in settings.DATABASE_URL:
            return "active"
        db = SessionLocal()
        own_db = True

    try:
        clean_email = email.strip().lower() if email else None
        if clean_email:
            deleted = db.execute(
                text("SELECT 1 FROM deleted_accounts WHERE lower(email) = :email LIMIT 1"),
                {"email": clean_email},
            ).scalar()
        else:
            deleted = db.execute(
                text("SELECT 1 FROM deleted_accounts WHERE user_id = :uid LIMIT 1"),
                {"uid": user_id},
            ).scalar()

        if deleted:
            status_val = "deleted"
        else:
            row = db.execute(
                text("SELECT account_status FROM profiles WHERE user_id = :uid LIMIT 1"),
                {"uid": user_id},
            ).scalar()
            status_val = str(row) if row in ("active", "suspended", "disabled") else "active"
    finally:
        if own_db:
            db.close()

    if client is not None:
        try:
            client.setex(cache_key, ACCOUNT_STATUS_CACHE_TTL, status_val)
        except Exception as exc:
            logger.warning(f"Redis write failed for {cache_key}: {exc}")

    return status_val


def is_user_active(
    db: Optional[Session],
    user_id: str,
    email: Optional[str] = None,
) -> bool:
    """Return True only if the user is active (not suspended, disabled, or deleted)."""
    return get_user_account_status(db, user_id, email=email) == "active"


def ensure_user_active_or_403(
    user_id: str,
    email: Optional[str] = None,
    db: Optional[Session] = None,
) -> None:
    """Raise HTTP 403 with ACCOUNT_SUSPENDED / ACCOUNT_DISABLED / ACCOUNT_DELETED if not active."""
    status_val = get_user_account_status(db, user_id, email=email)
    if status_val in _STATUS_CODE_MAP:
        code, message = _STATUS_CODE_MAP[status_val]
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": code, "message": message},
        )
