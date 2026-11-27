"""Shared admin authentication, verified-email enforcement, audit logging, and Redis rate limiting."""

from dataclasses import dataclass
import logging
from typing import Tuple

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import enforce_rate_limit
from app.db.session import get_db
from app.models.admin import AdminAuditLog

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AdminCaller:
    id: str
    email: str


def resolve_user_email_and_verified(db: Session, user: User) -> Tuple[str, bool]:
    """Look up email and emailVerified from neon_auth.user (authoritative)."""
    row = db.execute(
        text('SELECT email, "emailVerified" FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": user.id},
    ).fetchone()
    if row:
        email = str(row.email).strip().lower() if row.email else (user.email or "").strip().lower()
        verified = bool(row.emailVerified)
        return email, verified
    return (user.email or "").strip().lower(), False


def log_admin_access_denied(
    db: Session,
    user: User,
    caller_email: str,
    reason: str,
) -> None:
    try:
        db.add(
            AdminAuditLog(
                actor_id=user.id,
                actor_email=caller_email or user.id,
                action="admin.access_denied",
                target_type="admin",
                target_id=user.id,
                target_email=caller_email or None,
                reason=reason,
            )
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning(f"Failed to write admin.access_denied audit log: {exc}")


def require_admin_caller(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> AdminCaller:
    """Verify caller is active and in ADMIN_EMAILS."""
    caller_email, _email_verified = resolve_user_email_and_verified(db, user)
    if not caller_email or caller_email not in settings.admin_email_set:
        log_admin_access_denied(db, user, caller_email, "Email not in ADMIN_EMAILS")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Admin access required."},
        )
    return AdminCaller(id=user.id, email=caller_email)


def require_admin(admin: AdminCaller = Depends(require_admin_caller)) -> str:
    """Backward-compatible dependency returning the verified admin email string."""
    return admin.email


def rate_limit_admin_mutation(admin: AdminCaller = Depends(require_admin_caller)) -> AdminCaller:
    """Redis-backed rate limit for mutating admin endpoints (60 requests per minute)."""
    enforce_rate_limit(
        key=f"rate_limit:admin_mutate:{admin.id}",
        max_requests=60,
        window_seconds=60,
        error_message="Too many admin actions in a short time. Wait a moment and try again.",
    )
    return admin
