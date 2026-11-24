"""Admin payment verification routes (protected by ADMIN_EMAILS)."""

import datetime
import logging
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import desc, text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.plans import ANNUAL_PERIOD_DAYS, MONTHLY_WINDOW_DAYS, PLANS
from app.db.session import get_db
from app.models.subscription import Payment
from app.services.entitlements import ensure_trial_subscription, invalidate_effective_plan_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _resolve_user_email(db: Session, user: User) -> str:
    if user.email:
        return user.email.strip().lower()
    row = db.execute(
        text("SELECT email FROM neon_auth.user WHERE id::text = :uid LIMIT 1"),
        {"uid": user.id},
    ).scalar()
    return str(row).strip().lower() if row else ""


def require_admin(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> str:
    """Confirm the authenticated caller's email is in ADMIN_EMAILS (403 otherwise)."""
    caller_email = _resolve_user_email(db, user)
    if not caller_email or caller_email not in settings.admin_email_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "forbidden", "message": "Admin access required."},
        )
    return caller_email


class RejectPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: str = Field(..., min_length=2, max_length=300)


def _parse_payment_id(raw_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Payment not found."},
        )


@router.get("/me")
def admin_me(admin_email: str = Depends(require_admin)) -> Dict[str, Any]:
    return {"is_admin": True, "email": admin_email}


@router.get("/payments")
def list_admin_payments(
    status_filter: str = Query("pending", alias="status"),
    admin_email: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if status_filter not in ("pending", "approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_status", "message": "Status must be pending, approved, or rejected."},
        )

    rows = db.execute(
        text(
            "SELECT p.id, p.user_id, p.plan_id, p.billing_interval, p.amount_usd_cents, "
            "       p.amount_pkr, p.method, p.transaction_id, p.status, p.submitted_at, "
            "       p.reviewed_by, p.reviewed_at, p.reject_reason, u.email AS user_email "
            "FROM payments p "
            "LEFT JOIN neon_auth.user u ON u.id::text = p.user_id "
            "WHERE p.status = :status "
            "ORDER BY p.submitted_at DESC "
            "LIMIT 200"
        ),
        {"status": status_filter},
    ).fetchall()

    items: List[Dict[str, Any]] = []
    for r in rows:
        plan_cfg = PLANS.get(r.plan_id)
        items.append(
            {
                "id": str(r.id),
                "user_id": r.user_id,
                "user_email": r.user_email or r.user_id,
                "plan_id": r.plan_id,
                "plan_name": plan_cfg.name if plan_cfg else r.plan_id,
                "billing_interval": r.billing_interval,
                "amount_usd_cents": r.amount_usd_cents,
                "amount_usd": round(r.amount_usd_cents / 100.0, 2),
                "amount_pkr": r.amount_pkr,
                "method": r.method,
                "transaction_id": r.transaction_id,
                "status": r.status,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
                "reviewed_by": r.reviewed_by,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "reject_reason": r.reject_reason,
            }
        )
    return {"items": items}


@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: str,
    admin_email: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    pid = _parse_payment_id(payment_id)
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    # Atomic claim: only one concurrent approve/reject can transition status from 'pending'
    row = db.execute(
        text(
            "UPDATE payments "
            "SET status = 'approved', reviewed_by = :admin_email, reviewed_at = :now_utc "
            "WHERE id = :id AND status = 'pending' "
            "RETURNING id, user_id, plan_id, billing_interval, status, reviewed_by, reviewed_at"
        ),
        {"id": pid, "admin_email": admin_email, "now_utc": now_utc},
    ).fetchone()

    if not row:
        exists = db.execute(text("SELECT id FROM payments WHERE id = :id"), {"id": pid}).fetchone()
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": "Payment not found."},
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_reviewed", "message": "already reviewed"},
        )

    sub = ensure_trial_subscription(db, row.user_id)
    days = ANNUAL_PERIOD_DAYS if row.billing_interval == "annual" else MONTHLY_WINDOW_DAYS

    existing_end = sub.current_period_end
    if existing_end is not None and existing_end.tzinfo is None:
        existing_end = existing_end.replace(tzinfo=datetime.timezone.utc)

    if (
        sub.status == "active"
        and sub.plan_id == row.plan_id
        and existing_end is not None
        and existing_end > now_utc
    ):
        new_start = sub.current_period_start or now_utc
        new_end = existing_end + datetime.timedelta(days=days)
    else:
        new_start = now_utc
        new_end = now_utc + datetime.timedelta(days=days)

    sub.plan_id = row.plan_id
    sub.status = "active"
    sub.billing_interval = row.billing_interval
    sub.current_period_start = new_start
    sub.current_period_end = new_end
    sub.provider = "manual_qr"
    sub.provider_ref = str(row.id)
    sub.updated_at = now_utc

    db.commit()
    invalidate_effective_plan_cache(row.user_id)

    return {
        "id": str(row.id),
        "status": "approved",
        "user_id": row.user_id,
        "plan_id": row.plan_id,
        "billing_interval": row.billing_interval,
        "current_period_end": new_end.isoformat(),
    }


@router.post("/payments/{payment_id}/reject")
def reject_payment(
    payment_id: str,
    payload: RejectPaymentRequest,
    admin_email: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    pid = _parse_payment_id(payment_id)
    reason_clean = payload.reason.strip()
    if len(reason_clean) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "Please provide a short reason."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    row = db.execute(
        text(
            "UPDATE payments "
            "SET status = 'rejected', reviewed_by = :admin_email, reviewed_at = :now_utc, reject_reason = :reason "
            "WHERE id = :id AND status = 'pending' "
            "RETURNING id, user_id, status, reject_reason, reviewed_by, reviewed_at"
        ),
        {"id": pid, "admin_email": admin_email, "now_utc": now_utc, "reason": reason_clean},
    ).fetchone()

    if not row:
        exists = db.execute(text("SELECT id FROM payments WHERE id = :id"), {"id": pid}).fetchone()
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "not_found", "message": "Payment not found."},
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "already_reviewed", "message": "already reviewed"},
        )

    db.commit()
    return {
        "id": str(row.id),
        "status": "rejected",
        "reject_reason": row.reject_reason,
    }
