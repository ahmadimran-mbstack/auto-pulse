"""Admin payment verification, manual payment recording, voiding, and secret activation routes."""

import calendar
import datetime
import hmac
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import (
    AdminCaller,
    rate_limit_admin_mutation,
    require_admin,
    require_admin_caller,
)
from app.core.config import settings
from app.core.limiter import _fixed_window_check, get_redis_client
from app.core.plans import PKR_PER_USD, compute_plan_price, get_plans, get_purchasable_plan_ids
from app.db.session import get_db
from app.models.admin import AdminAuditLog
from app.models.subscription import Payment
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.entitlements import (
    activate_paid_subscription,
    ensure_trial_subscription,
    invalidate_effective_plan_cache,
    set_user_plan,
)
from app.services.notifications import send_user_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

_VALID_PAYMENT_METHODS = ("easypaisa", "jazzcash", "manual", "cash", "bank_transfer")
_VALID_PAYMENT_STATUSES = ("pending", "approved", "rejected", "voided", "all")
_MANUAL_TX_RE = re.compile(r"^[A-Z0-9-]{4,40}$")

# In-memory fallback for secret-endpoint lockout when Redis is offline
_secret_fail_counts: Dict[str, tuple[int, float]] = {}
_secret_lockouts: Dict[str, float] = {}


class RejectPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: str = Field(..., min_length=2, max_length=300)


class RecordPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str = Field(..., min_length=1)
    plan_id: str = Field(..., min_length=1)
    billing_interval: str = "monthly"
    amount_usd: Optional[float] = Field(default=None, ge=0)
    method: str = "manual"
    transaction_id: Optional[str] = None
    paid_at: Optional[str] = None
    subscription_ends_at: Optional[str] = None
    activate_plan: bool = True
    send_email: bool = True
    note: Optional[str] = Field(default=None, max_length=500)


class VoidPaymentRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    reason: str = Field(..., min_length=2, max_length=500)
    revoke_access: bool = True
    send_email: bool = True
    user_message: Optional[str] = Field(default=None, max_length=1000)


class SecretActivatePlanRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    user_id: str = Field(..., min_length=1)
    plan_id: str = Field(..., min_length=1)
    billing_interval: str = "monthly"
    subscription_ends_at: Optional[str] = None
    reason: str = Field(..., min_length=2, max_length=500)


def _parse_payment_id(raw_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Payment not found."},
        )


def _parse_utc_timestamp(raw: str, end_of_day_for_date: bool = True) -> datetime.datetime:
    s = raw.strip()
    if len(s) == 10 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        d = datetime.date.fromisoformat(s)
        if end_of_day_for_date:
            return datetime.datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=datetime.timezone.utc)
        return datetime.datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=datetime.timezone.utc)
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    dt = datetime.datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def _subtract_calendar_months(dt: datetime.datetime, months: int) -> datetime.datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    total_months = dt.year * 12 + (dt.month - 1) - months
    new_year = total_months // 12
    new_month = (total_months % 12) + 1
    last_day = calendar.monthrange(new_year, new_month)[1]
    return dt.replace(year=new_year, month=new_month, day=min(dt.day, last_day))


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
    if status_filter not in _VALID_PAYMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "invalid_status",
                "message": "Status must be pending, approved, rejected, voided, or all.",
            },
        )

    where_clauses = ["1=1"]
    params: Dict[str, Any] = {
        "limit": page_size,
        "offset": (page - 1) * page_size,
    }
    if status_filter != "all":
        where_clauses.append("p.status = :status")
        params["status"] = status_filter

    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        where_clauses.append(
            "(p.transaction_id ILIKE :q OR COALESCE(u.email, p.user_email, '') ILIKE :q)"
        )

    if method and method.strip():
        m = method.strip().lower()
        if m not in _VALID_PAYMENT_METHODS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_method", "message": "Invalid payment method."},
            )
        params["method"] = m
        where_clauses.append("p.method = :method")

    if plan and plan.strip():
        pl = plan.strip().lower()
        if pl not in get_plans():
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
            "       p.source, p.recorded_by, p.note, p.voided_at, p.voided_by, p.void_reason, "
            "       COALESCE(u.email, p.user_email) AS user_email "
            f"{base_from} "
            f"WHERE {where_sql} "
            "ORDER BY p.submitted_at DESC "
            "LIMIT :limit OFFSET :offset"
        ),
        params,
    ).fetchall()

    plans_map = get_plans()
    items: List[Dict[str, Any]] = []
    for r in rows:
        plan_cfg = plans_map.get(r.plan_id)
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
                "source": r.source,
                "recorded_by": r.recorded_by,
                "note": r.note,
                "voided_at": r.voided_at.isoformat() if r.voided_at else None,
                "voided_by": r.voided_by,
                "void_reason": r.void_reason,
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


@router.post("/payments/record", status_code=status.HTTP_201_CREATED)
def record_manual_payment(
    payload: RecordPaymentRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Record an already-collected payment manually and optionally activate the user's plan."""
    plan_id = payload.plan_id.strip().lower()
    interval = payload.billing_interval.strip().lower()
    method = payload.method.strip().lower()
    plans_map = get_plans()

    if plan_id not in plans_map or plan_id in ("trial", "internal"):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_plan", "message": "Select a valid paid plan."},
        )
    if interval not in ("monthly", "annual"):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_interval", "message": "Billing interval must be monthly or annual."},
        )
    if method not in _VALID_PAYMENT_METHODS:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_method", "message": "Invalid payment method."},
        )

    user_row = db.execute(
        text(
            'SELECT u.id::text AS id, u.email, COALESCE(NULLIF(TRIM(p.display_name), \'\'), u.name) AS display_name '
            'FROM neon_auth."user" u '
            'LEFT JOIN profiles p ON p.user_id = u.id::text '
            'WHERE u.id::text = :uid LIMIT 1'
        ),
        {"uid": payload.user_id.strip()},
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})

    if payload.amount_usd is not None:
        amount_usd_cents = int(round(payload.amount_usd * 100))
        amount_pkr = math.ceil((amount_usd_cents / 100.0) * PKR_PER_USD)
    else:
        if plan_id in get_purchasable_plan_ids():
            amount_usd_cents, amount_pkr = compute_plan_price(plan_id, interval)
        else:
            cfg = plans_map[plan_id]
            base_usd = (cfg.annual_price_usd if interval == "annual" else cfg.monthly_price_usd) or 0.0
            amount_usd_cents = int(round(base_usd * 100))
            amount_pkr = math.ceil((amount_usd_cents / 100.0) * PKR_PER_USD)

    raw_tx = (payload.transaction_id or "").strip().upper()
    if not raw_tx:
        tx_id = f"MANUAL-{uuid.uuid4().hex[:8].upper()}"
    else:
        if not _MANUAL_TX_RE.match(raw_tx):
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_transaction_id", "message": "Transaction ID must be 4 to 40 letters, digits, or hyphens."},
            )
        tx_id = raw_tx

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    try:
        paid_at_dt = _parse_utc_timestamp(payload.paid_at, end_of_day_for_date=False) if payload.paid_at else now_utc
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": "invalid_paid_at", "message": "Invalid paid_at date."})

    custom_end_dt: Optional[datetime.datetime] = None
    if payload.subscription_ends_at:
        try:
            custom_end_dt = _parse_utc_timestamp(payload.subscription_ends_at, end_of_day_for_date=True)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_end_date", "message": "Invalid subscription_ends_at date."},
            )

    user_email = (user_row.email or "").strip() or None
    display_name = str(user_row.display_name or (user_email.split("@")[0] if user_email else "Creator"))
    clean_note = (payload.note or "").strip() or None

    payment = Payment(
        user_id=user_row.id,
        user_email=user_email,
        plan_id=plan_id,
        billing_interval=interval,
        amount_usd_cents=amount_usd_cents,
        amount_pkr=amount_pkr,
        method=method,
        transaction_id=tx_id,
        status="approved",
        submitted_at=paid_at_dt,
        reviewed_by=admin.email,
        reviewed_at=now_utc,
        source="manual",
        recorded_by=admin.email,
        note=clean_note,
    )
    db.add(payment)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "duplicate_transaction_id", "message": "This transaction ID has already been used."},
        )

    before_sub = None
    new_end: Optional[datetime.datetime] = None
    if payload.activate_plan:
        sub, before_sub = activate_paid_subscription(
            db=db,
            user_id=user_row.id,
            plan_id=plan_id,
            billing_interval=interval,
            provider="manual",
            provider_ref=str(payment.id),
            now=paid_at_dt,
        )
        if custom_end_dt is not None:
            sub.current_period_end = custom_end_dt
            db.flush()
        new_end = sub.current_period_end or paid_at_dt

    will_send_email = bool(payload.send_email and user_email)
    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="payment.recorded",
        target_type="payment",
        target_id=str(payment.id),
        target_email=user_email,
        reason=clean_note or f"Recorded manual {method} payment {tx_id}",
        before_state={"subscription": before_sub} if before_sub is not None else None,
        after_state={
            "payment_status": "approved",
            "source": "manual",
            "plan_id": plan_id,
            "billing_interval": interval,
            "amount_usd_cents": amount_usd_cents,
            "transaction_id": tx_id,
            "activate_plan": payload.activate_plan,
            "current_period_end": new_end.isoformat() if new_end else None,
        },
        email_status="pending" if will_send_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(payment)
    db.refresh(audit)

    invalidate_effective_plan_cache(user_row.id)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if will_send_email and user_email:
        plan_name = plans_map[plan_id].name if plan_id in plans_map else plan_id
        amount_str = f"${amount_usd_cents / 100.0:.2f} (Rs {amount_pkr:,})"
        paid_until_str = (
            new_end.astimezone(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            if new_end
            else "Recorded (plan not changed)"
        )
        email_res = send_user_notification(
            user_id=user_row.id,
            to_email=user_email,
            notification_type="payment_approved",
            payload={
                "display_name": display_name,
                "amount": amount_str,
                "plan_name": plan_name,
                "billing_interval": interval,
                "paid_until": paid_until_str,
                "transaction_id": tx_id,
            },
            idempotency_key=f"payment_approved:{payment.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": str(payment.id),
        "status": "approved",
        "source": "manual",
        "transaction_id": tx_id,
        "user_id": user_row.id,
        "plan_id": plan_id,
        "billing_interval": interval,
        "amount_usd_cents": amount_usd_cents,
        "amount_usd": round(amount_usd_cents / 100.0, 2),
        "amount_pkr": amount_pkr,
        "current_period_end": new_end.isoformat() if new_end else None,
        "email_status": email_status,
        "email_error": email_error,
    }


@router.patch("/payments/{payment_id}/void")
def void_payment(
    payment_id: str,
    payload: VoidPaymentRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Atomically void an approved payment, optionally revoke the added period, and email user."""
    pid = _parse_payment_id(payment_id)
    reason_clean = payload.reason.strip()
    if len(reason_clean) < 2:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_reason", "message": "A reason is required to void a payment."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    row = db.execute(
        text(
            "UPDATE payments "
            "SET status = 'voided', voided_at = :now_utc, voided_by = :admin_email, void_reason = :reason "
            "WHERE id = :id AND status = 'approved' "
            "RETURNING id, user_id, user_email, plan_id, billing_interval, amount_usd_cents, "
            "          amount_pkr, method, transaction_id, status, voided_at"
        ),
        {"id": pid, "now_utc": now_utc, "admin_email": admin.email, "reason": reason_clean},
    ).fetchone()

    if not row:
        exists = db.execute(text("SELECT id, status FROM payments WHERE id = :id"), {"id": pid}).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Payment not found."})
        raise HTTPException(
            status_code=409,
            detail={
                "code": "cannot_void",
                "message": f"Only approved payments can be voided (current status: {exists.status}).",
            },
        )

    sub = ensure_trial_subscription(db, row.user_id)
    before_end = sub.current_period_end
    new_end: Optional[datetime.datetime] = before_end
    if payload.revoke_access and before_end is not None:
        end_utc = before_end.replace(tzinfo=datetime.timezone.utc) if before_end.tzinfo is None else before_end.astimezone(datetime.timezone.utc)
        months_to_subtract = 12 if row.billing_interval == "annual" else 1
        subtracted = _subtract_calendar_months(end_utc, months_to_subtract)
        new_end = max(now_utc, subtracted)
        sub.current_period_end = new_end
        sub.updated_at = now_utc
        db.flush()

    user_email, display_name = _resolve_payment_recipient(db, row.user_id, row.user_email)
    will_send_email = bool(payload.send_email and user_email)
    audit = AdminAuditLog(
        actor_id=admin.id,
        actor_email=admin.email,
        action="payment.voided",
        target_type="payment",
        target_id=str(row.id),
        target_email=user_email,
        reason=reason_clean,
        before_state={
            "payment_status": "approved",
            "current_period_end": before_end.isoformat() if before_end else None,
        },
        after_state={
            "payment_status": "voided",
            "revoke_access": payload.revoke_access,
            "current_period_end": new_end.isoformat() if new_end else None,
        },
        email_status="pending" if will_send_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    invalidate_effective_plan_cache(row.user_id)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if will_send_email and user_email:
        plans_map = get_plans()
        plan_cfg = plans_map.get(row.plan_id)
        plan_name = plan_cfg.name if plan_cfg else row.plan_id
        amount_str = f"${row.amount_usd_cents / 100.0:.2f} (Rs {row.amount_pkr:,})"
        access_note = (
            f"Your subscription period end date was adjusted to {new_end.astimezone(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}."
            if payload.revoke_access and new_end
            else "Your current plan access was kept unchanged."
        )
        email_res = send_user_notification(
            user_id=row.user_id,
            to_email=user_email,
            notification_type="payment_voided",
            payload={
                "display_name": display_name,
                "amount": amount_str,
                "plan_name": plan_name,
                "transaction_id": row.transaction_id,
                "reason": reason_clean,
                "access_note": access_note,
                "user_message": (payload.user_message or "").strip(),
            },
            idempotency_key=f"payment_voided:{row.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": str(row.id),
        "status": "voided",
        "user_id": row.user_id,
        "revoke_access": payload.revoke_access,
        "new_current_period_end": new_end.isoformat() if new_end else None,
        "email_status": email_status,
        "email_error": email_error,
    }


def _extract_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _is_secret_ip_locked(ip: str) -> bool:
    lock_key = f"admin_activate_lock:{ip}"
    client = get_redis_client()
    if client is not None:
        try:
            if client.get(lock_key):
                return True
        except Exception:
            pass
    exp = _secret_lockouts.get(ip)
    if exp is not None:
        if time.time() < exp:
            return True
        _secret_lockouts.pop(ip, None)
    return False


def _record_secret_failure(ip: str) -> None:
    fail_key = f"admin_activate_fail:{ip}"
    lock_key = f"admin_activate_lock:{ip}"
    client = get_redis_client()
    if client is not None:
        try:
            cnt = int(client.incr(fail_key))
            if cnt == 1:
                client.expire(fail_key, 900)
            if cnt >= 5:
                client.setex(lock_key, 900, "1")
            return
        except Exception:
            pass
    now = time.time()
    prev_cnt, first_ts = _secret_fail_counts.get(ip, (0, now))
    if now - first_ts > 900:
        prev_cnt = 0
        first_ts = now
    new_cnt = prev_cnt + 1
    _secret_fail_counts[ip] = (new_cnt, first_ts)
    if new_cnt >= 5:
        _secret_lockouts[ip] = now + 900


def _clear_secret_failures(ip: str) -> None:
    _secret_fail_counts.pop(ip, None)
    _secret_lockouts.pop(ip, None)
    client = get_redis_client()
    if client is not None:
        try:
            client.delete(f"admin_activate_fail:{ip}")
        except Exception:
            pass


@router.post("/activate-plan")
def secret_activate_plan(
    request: Request,
    payload: SecretActivatePlanRequest,
    x_admin_secret: Optional[str] = Header(default=None, alias="x-admin-secret"),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Secret-protected programmatic plan activation endpoint (no payment row, no email)."""
    expected_secret = (settings.ADMIN_ACTIVATE_SECRET or "").strip()
    if not expected_secret:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    client_ip = _extract_ip(request)
    if _is_secret_ip_locked(client_ip):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    allowed, _, _, _ = _fixed_window_check(
        bucket="admin_activate_ip",
        subject_id=client_ip,
        max_requests=5,
        window_seconds=60,
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    provided = (x_admin_secret or "").strip()
    if not provided or not hmac.compare_digest(provided.encode("utf-8"), expected_secret.encode("utf-8")):
        _record_secret_failure(client_ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    _clear_secret_failures(client_ip)

    plan_id = payload.plan_id.strip().lower()
    interval = payload.billing_interval.strip().lower()
    plans_map = get_plans()
    if plan_id not in plans_map:
        raise HTTPException(status_code=400, detail={"code": "invalid_plan", "message": "Unknown plan."})
    if plan_id not in ("trial", "internal") and interval not in ("monthly", "annual"):
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_interval", "message": "Billing interval must be monthly or annual."},
        )

    user_row = db.execute(
        text(
            'SELECT u.id::text AS id, u.email, COALESCE(p.account_status, \'active\') AS account_status '
            'FROM neon_auth."user" u '
            'LEFT JOIN profiles p ON p.user_id = u.id::text '
            'WHERE u.id::text = :uid LIMIT 1'
        ),
        {"uid": payload.user_id.strip()},
    ).fetchone()
    if not user_row:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "User not found."})
    if user_row.account_status != "active":
        raise HTTPException(
            status_code=400,
            detail={"code": "account_not_active", "message": f"Account status is {user_row.account_status}."},
        )

    custom_end_dt: Optional[datetime.datetime] = None
    if payload.subscription_ends_at:
        try:
            custom_end_dt = _parse_utc_timestamp(payload.subscription_ends_at, end_of_day_for_date=True)
        except ValueError:
            raise HTTPException(status_code=400, detail={"code": "invalid_end_date", "message": "Invalid end date."})

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if plan_id in ("trial", "internal"):
        existing_sub = ensure_trial_subscription(db, user_row.id)
        before_sub = {
            "plan_id": existing_sub.plan_id,
            "status": existing_sub.status,
            "billing_interval": existing_sub.billing_interval,
            "current_period_end": existing_sub.current_period_end.isoformat() if existing_sub.current_period_end else None,
        }
        sub = set_user_plan(
            db,
            user_id=user_row.id,
            plan_id=plan_id,
            interval=None,
            now=now_utc,
            provider="secret_endpoint",
        )
    else:
        sub, before_sub = activate_paid_subscription(
            db=db,
            user_id=user_row.id,
            plan_id=plan_id,
            billing_interval=interval,
            provider="secret_endpoint",
            now=now_utc,
        )

    if custom_end_dt is not None:
        if plan_id == "trial":
            sub.trial_ends_at = custom_end_dt
        else:
            sub.current_period_end = custom_end_dt
        db.flush()

    audit = AdminAuditLog(
        actor_id="secret-endpoint",
        actor_email=f"secret-endpoint ({client_ip})",
        action="plan.secret_activated",
        target_type="user",
        target_id=user_row.id,
        target_email=user_row.email,
        reason=payload.reason.strip(),
        before_state=before_sub,
        after_state={
            "plan_id": sub.plan_id,
            "status": sub.status,
            "billing_interval": sub.billing_interval,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
            "ip": client_ip,
        },
        email_status="not_sent",
    )
    db.add(audit)
    db.commit()

    invalidate_effective_plan_cache(user_row.id)
    invalidate_admin_overview_cache()

    return {
        "activated": True,
        "user_id": user_row.id,
        "plan_id": sub.plan_id,
        "status": sub.status,
        "billing_interval": sub.billing_interval,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


@router.post("/payments/{payment_id}/approve")
def approve_payment(
    payment_id: str,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    pid = _parse_payment_id(payment_id)
    now_utc = datetime.datetime.now(datetime.timezone.utc)

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
        plan_cfg = get_plans().get(row.plan_id)
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
