"""Admin payment verification routes (protected by verified ADMIN_EMAILS)."""

import datetime
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import (
    AdminCaller,
    rate_limit_admin_mutation,
    require_admin,
    require_admin_caller,
)
from app.core.plans import PLANS, PURCHASABLE_PLANS
from app.db.session import get_db
from app.models.admin import AdminAuditLog
from app.services.entitlements import (
    activate_paid_subscription,
    invalidate_effective_plan_cache,
)
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.notifications import send_user_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


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


def _resolve_payment_recipient(db: Session, user_id: str, fallback_email: Optional[str]) -> tuple[Optional[str], str]:
    row = db.execute(
        text(
            'SELECT u.email, COALESCE(NULLIF(TRIM(pr.display_name), \'\'), u.name) AS display_name '
            'FROM neon_auth."user" u '
            'LEFT JOIN profiles pr ON pr.user_id = u.id::text '
            'WHERE u.id::text = :uid LIMIT 1'
        ),
        {"uid": user_id},
    ).fetchone()
    if row and row.email:
        email = str(row.email).strip()
        name = str(row.display_name or email.split("@")[0])
        return email, name
    if fallback_email:
        return fallback_email, fallback_email.split("@")[0]
    return None, "Creator"


@router.get("/me")
def admin_me(admin_email: str = Depends(require_admin)) -> Dict[str, Any]:
    return {"is_admin": True, "email": admin_email}


@router.get("/payments")
def list_admin_payments(
    status_filter: str = Query("pending", alias="status"),
    search: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    if status_filter not in ("pending", "approved", "rejected"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_status", "message": "Status must be pending, approved, or rejected."},
        )

    where_clauses = ["p.status = :status"]
    params: Dict[str, Any] = {
        "status": status_filter,
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }

    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        where_clauses.append(
            "(p.transaction_id ILIKE :q OR COALESCE(u.email, p.user_email, '') ILIKE :q)"
        )

    if method and method.strip():
        m = method.strip().lower()
        if m not in ("easypaisa", "jazzcash"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_method", "message": "Method must be easypaisa or jazzcash."},
            )
        params["method"] = m
        where_clauses.append("p.method = :method")

    if plan and plan.strip():
        pl = plan.strip().lower()
        if pl not in PURCHASABLE_PLANS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_plan", "message": "Invalid plan filter."},
            )
        params["plan_id"] = pl
        where_clauses.append("p.plan_id = :plan_id")

    where_sql = " AND ".join(where_clauses)
    base_from = (
        "FROM payments p "
        'LEFT JOIN neon_auth."user" u ON u.id::text = p.user_id '
    )

    total = int(
        db.execute(text(f"SELECT COUNT(*) {base_from} WHERE {where_sql}"), params).scalar() or 0
    )
    pending_count = int(
        db.execute(text("SELECT COUNT(*) FROM payments WHERE status = 'pending'")).scalar() or 0
    )

    rows = db.execute(
        text(
            "SELECT p.id, p.user_id, p.plan_id, p.billing_interval, p.amount_usd_cents, "
            "       p.amount_pkr, p.method, p.transaction_id, p.status, p.submitted_at, "
            "       p.reviewed_by, p.reviewed_at, p.reject_reason, "
            "       COALESCE(u.email, p.user_email) AS user_email "
            f"{base_from} "
            f"WHERE {where_sql} "
            "ORDER BY p.submitted_at DESC "
            "LIMIT :limit OFFSET :offset"
        ),
        params,
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
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "pending_count": pending_count,
    }


@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: str,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
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
            "RETURNING id, user_id, user_email, plan_id, billing_interval, amount_usd_cents, "
            "          amount_pkr, method, transaction_id, status, reviewed_by, reviewed_at"
        ),
        {"id": pid, "admin_email": admin.email, "now_utc": now_utc},
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

    sub, before_sub = activate_paid_subscription(
        db=db,
        user_id=row.user_id,
        plan_id=row.plan_id,
        billing_interval=row.billing_interval,
        provider="manual_qr",
        provider_ref=str(row.id),
        now=now_utc,
    )
    new_end = sub.current_period_end or now_utc

    user_email, display_name = _resolve_payment_recipient(db, row.user_id, row.user_email)
    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="payment.approved",
        target_type="payment",
        target_id=str(row.id),
        target_email=user_email,
        reason=f"Approved {row.method} payment {row.transaction_id}",
        before_state={"payment_status": "pending", "subscription": before_sub},
        after_state={
            "payment_status": "approved",
            "plan_id": row.plan_id,
            "billing_interval": row.billing_interval,
            "current_period_end": new_end.isoformat(),
        },
        email_status="pending" if user_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    invalidate_effective_plan_cache(row.user_id)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if user_email:
        plan_cfg = PLANS.get(row.plan_id)
        plan_name = plan_cfg.name if plan_cfg else row.plan_id
        amount_str = f"${row.amount_usd_cents / 100.0:.2f} (Rs {row.amount_pkr:,})"
        email_res = send_user_notification(
            user_id=row.user_id,
            to_email=user_email,
            notification_type="payment_approved",
            payload={
                "display_name": display_name,
                "amount": amount_str,
                "plan_name": plan_name,
                "billing_interval": row.billing_interval,
                "paid_until": new_end.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                "transaction_id": row.transaction_id,
            },
            idempotency_key=f"payment_approved:{row.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": str(row.id),
        "status": "approved",
        "user_id": row.user_id,
        "plan_id": row.plan_id,
        "billing_interval": row.billing_interval,
        "current_period_end": new_end.isoformat(),
        "email_status": email_status,
        "email_error": email_error,
    }


@router.post("/payments/{payment_id}/reject")
def reject_payment(
    payment_id: str,
    payload: RejectPaymentRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
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
            "RETURNING id, user_id, user_email, amount_usd_cents, amount_pkr, method, transaction_id, "
            "          status, reject_reason, reviewed_by, reviewed_at"
        ),
        {"id": pid, "admin_email": admin.email, "now_utc": now_utc, "reason": reason_clean},
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

    user_email, display_name = _resolve_payment_recipient(db, row.user_id, row.user_email)
    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="payment.rejected",
        target_type="payment",
        target_id=str(row.id),
        target_email=user_email,
        reason=reason_clean,
        before_state={"payment_status": "pending"},
        after_state={"payment_status": "rejected", "reject_reason": reason_clean},
        email_status="pending" if user_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if user_email:
        amount_str = f"${row.amount_usd_cents / 100.0:.2f} (Rs {row.amount_pkr:,})"
        email_res = send_user_notification(
            user_id=row.user_id,
            to_email=user_email,
            notification_type="payment_rejected",
            payload={
                "display_name": display_name,
                "amount": amount_str,
                "transaction_id": row.transaction_id,
                "reason": reason_clean,
            },
            idempotency_key=f"payment_rejected:{row.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": str(row.id),
        "status": "rejected",
        "user_id": row.user_id,
        "reject_reason": row.reject_reason,
        "email_status": email_status,
        "email_error": email_error,
    }
