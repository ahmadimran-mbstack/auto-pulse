"""User billing status, checkout info, and manual QR payment submission routes."""

import datetime
import logging
import math
import re
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import rate_limit
from app.core.plans import PLANS, PURCHASABLE_PLANS, compute_plan_price
from app.db.session import get_db
from app.models.subscription import Payment
from app.services.entitlements import get_effective_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

_TX_ID_RE = re.compile(r"^[A-Z0-9]{6,30}$")


class PaymentSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    plan_id: str
    billing_interval: str = Field(
        validation_alias=AliasChoices("billing_interval", "interval")
    )
    method: str
    transaction_id: str


def _serialize_payment(p: Payment) -> Dict[str, Any]:
    plan_cfg = PLANS.get(p.plan_id)
    return {
        "id": str(p.id),
        "plan_id": p.plan_id,
        "plan_name": plan_cfg.name if plan_cfg else p.plan_id,
        "billing_interval": p.billing_interval,
        "amount_usd_cents": p.amount_usd_cents,
        "amount_usd": round(p.amount_usd_cents / 100.0, 2),
        "amount_pkr": p.amount_pkr,
        "method": p.method,
        "transaction_id": p.transaction_id,
        "status": p.status,
        "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
        "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
        "reject_reason": p.reject_reason,
    }


@router.get("/status", dependencies=[Depends(rate_limit("api"))])
def get_billing_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return current effective plan, status, period end, days left, pending payment, and last 10 payments."""
    eff = get_effective_plan(db, user.id)
    db.commit()
    plan = eff["plan"]
    status_val = eff["status"]

    end_iso = eff["trial_ends_at"] if plan.id == "trial" else eff["current_period_end"]
    days_left: Optional[int] = None
    if end_iso:
        end_dt = datetime.datetime.fromisoformat(end_iso)
        if end_dt.tzinfo is None:
            end_dt = end_dt.replace(tzinfo=datetime.timezone.utc)
        delta_secs = (end_dt - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
        days_left = max(0, math.ceil(delta_secs / 86400.0)) if delta_secs > 0 else 0

    recent_rows: List[Payment] = list(
        db.scalars(
            select(Payment)
            .where(Payment.user_id == user.id)
            .order_by(desc(Payment.submitted_at))
            .limit(10)
        ).all()
    )
    pending_row = next((p for p in recent_rows if p.status == "pending"), None)

    return {
        "plan_id": plan.id,
        "plan_name": plan.name,
        "status": status_val,
        "billing_interval": eff["billing_interval"],
        "period_end": end_iso,
        "days_left": days_left,
        "pending_payment": _serialize_payment(pending_row) if pending_row else None,
        "payments": [_serialize_payment(p) for p in recent_rows],
    }


@router.get("/checkout-info", dependencies=[Depends(rate_limit("api"))])
def get_checkout_info(
    plan: str = Query(...),
    interval: str = Query("monthly"),
    user: User = Depends(current_user),
) -> Dict[str, Any]:
    """Return server-authoritative checkout pricing and QR account details."""
    plan_clean = plan.strip().lower()
    interval_clean = interval.strip().lower()
    if plan_clean not in PURCHASABLE_PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_plan", "message": "Selected plan cannot be purchased."},
        )
    if interval_clean not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_interval", "message": "Billing interval must be monthly or annual."},
        )

    usd_cents, amount_pkr = compute_plan_price(plan_clean, interval_clean)
    plan_cfg = PLANS[plan_clean]
    return {
        "plan_id": plan_clean,
        "plan_name": plan_cfg.name,
        "billing_interval": interval_clean,
        "amount_usd_cents": usd_cents,
        "amount_usd": round(usd_cents / 100.0, 2),
        "amount_pkr": amount_pkr,
        "account_title": settings.PAYMENT_ACCOUNT_TITLE,
        "account_last4": settings.PAYMENT_ACCOUNT_LAST4,
        "methods": ["easypaisa", "jazzcash"],
    }


@router.post("/payments", status_code=status.HTTP_201_CREATED, dependencies=[Depends(rate_limit("payment_submit"))])
def submit_payment(
    payload: PaymentSubmitRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Submit a manual QR payment transaction ID for admin review."""
    plan_id = payload.plan_id.strip().lower()
    interval = payload.billing_interval.strip().lower()
    method = payload.method.strip().lower()
    tx_id = payload.transaction_id.strip().upper()

    if plan_id not in PURCHASABLE_PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_plan", "message": "Selected plan cannot be purchased."},
        )
    if interval not in ("monthly", "annual"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_interval", "message": "Billing interval must be monthly or annual."},
        )
    if method not in ("easypaisa", "jazzcash"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_method", "message": "Payment method must be easypaisa or jazzcash."},
        )
    if not _TX_ID_RE.match(tx_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_transaction_id",
                "message": "Transaction ID must be 6 to 30 letters and numbers.",
            },
        )

    usd_cents, amount_pkr = compute_plan_price(plan_id, interval)
    payment = Payment(
        user_id=user.id,
        user_email=user.email,
        plan_id=plan_id,
        billing_interval=interval,
        amount_usd_cents=usd_cents,
        amount_pkr=amount_pkr,
        method=method,
        transaction_id=tx_id,
        status="pending",
    )
    db.add(payment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        err_text = str(exc.orig or exc).lower()
        if "uq_payments_user_pending" in err_text:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "pending_payment_exists",
                    "message": "You already have a payment waiting for verification.",
                },
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "duplicate_transaction_id",
                "message": "This transaction ID has already been submitted.",
            },
        )

    db.refresh(payment)
    return _serialize_payment(payment)
