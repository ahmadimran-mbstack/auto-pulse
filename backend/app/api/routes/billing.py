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
from app.core.plans import compute_plan_price, get_plan_entries, get_plans, get_purchasable_plan_ids
from app.db.session import get_db
from app.models.subscription import Payment
from app.services.entitlements import get_effective_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

_TX_ID_RE = re.compile(r"^[A-Z0-9]{6,30}$")


def _plan_rank_cents(plan_id: str, entries: Dict[str, Any]) -> int:
    if plan_id == "trial":
        return 0
    entry = entries.get(plan_id)
    if not entry or entry.is_system:
        return 0
    return int(entry.monthly_price_cents or 0)


class PaymentSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    plan_id: str
    billing_interval: str = Field(
        validation_alias=AliasChoices("billing_interval", "interval")
    )
    method: str
    transaction_id: str
    expected_amount_usd_cents: Optional[int] = None


def _serialize_payment(p: Payment, plans_map: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    plan_cfg = (plans_map if plans_map is not None else get_plans()).get(p.plan_id)
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
        "source": getattr(p, "source", "checkout"),
        "note": getattr(p, "note", None),
        "voided_at": p.voided_at.isoformat() if getattr(p, "voided_at", None) else None,
        "void_reason": getattr(p, "void_reason", None),
    }


@router.get("/status", dependencies=[Depends(rate_limit("api"))])
def get_billing_status(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Return current effective plan, status, period end, days left, pending payment, and last 10 payments."""
    from app.core.plans import ANNUAL_DISCOUNT, TRIAL_DAYS, get_plan_entries

    eff = get_effective_plan(db, user.id)
    db.commit()
    plan = eff["plan"]
    entry = get_plan_entries().get(plan.id)
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
        "is_active": entry.is_active if entry is not None else True,
        "is_system": entry.is_system if entry is not None else False,
        "monthly_price_usd": plan.monthly_price_usd,
        "annual_price_usd": plan.annual_price_usd,
        "annual_discount": ANNUAL_DISCOUNT,
        "trial_days": TRIAL_DAYS,
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
    if plan_clean not in get_purchasable_plan_ids():
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
    plan_cfg = get_plans()[plan_clean]
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

    if plan_id not in get_purchasable_plan_ids():
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

    eff = get_effective_plan(db, user.id, bypass_cache=True)
    current_plan_id = eff["plan_id"]
    current_status = eff["status"]
    if current_status == "active" and current_plan_id != "trial":
        entries = get_plan_entries()
        current_rank = _plan_rank_cents(current_plan_id, entries)
        target_rank = _plan_rank_cents(plan_id, entries)
        if current_rank > 0 and target_rank < current_rank:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "downgrade_not_allowed",
                    "message": "You can only upgrade from your current plan.",
                },
            )

    usd_cents, amount_pkr = compute_plan_price(plan_id, interval)
    if (
        payload.expected_amount_usd_cents is not None
        and int(payload.expected_amount_usd_cents) != int(usd_cents)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "price_changed",
                "message": (
                    f"The price for this plan changed to ${usd_cents / 100.0:.2f} "
                    f"(Rs {amount_pkr:,}). Please review and submit again."
                ),
                "amount_usd_cents": usd_cents,
                "amount_usd": round(usd_cents / 100.0, 2),
                "amount_pkr": amount_pkr,
            },
        )
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
