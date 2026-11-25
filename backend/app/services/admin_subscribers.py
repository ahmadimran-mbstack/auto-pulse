"""Service layer for Phase 4: admin plan changes, subscription end dates, subscribers, usage, and plans."""

import datetime
import logging
import math
from typing import Any, Dict, List, Optional
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.plans import (
    ANNUAL_DISCOUNT,
    MONTHLY_WINDOW_DAYS,
    PKR_PER_USD,
    PLAN_RATE_LIMITS,
    PLANS,
    PUBLIC_PLAN_ORDER,
    RATE_LIMIT_WINDOWS,
    get_plan,
    usd_to_pkr_approx,
)
from app.models.admin import AdminAuditLog
from app.services.account_status import invalidate_user_status_cache
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.entitlements import (
    compute_subscription_status,
    ensure_trial_subscription,
    invalidate_effective_plan_cache,
)
from app.services.notifications import send_user_notification
from app.services.payments import PLAN_TIER
from app.services.quota import COUNTED_RUN_STATUSES

logger = logging.getLogger(__name__)


def _plan_limit_sql_case() -> str:
    whens = []
    for pid, cfg in PLANS.items():
        if cfg.scheduled_posts_per_period is None:
            whens.append(f"WHEN '{pid}' THEN NULL")
        else:
            whens.append(f"WHEN '{pid}' THEN {int(cfg.scheduled_posts_per_period)}")
    return f"CASE COALESCE(s.plan_id, 'trial') {' '.join(whens)} ELSE 3 END"


def _monthly_rate_sql_case() -> str:
    """Compute monthly rate in USD from PLANS (annual_price_usd / 12 for annual)."""
    whens = []
    for pid, cfg in PLANS.items():
        if pid in ("trial", "internal") or cfg.monthly_price_usd is None:
            whens.append(f"WHEN '{pid}' THEN 0.0")
        else:
            monthly_val = float(cfg.monthly_price_usd)
            annual_val = (
                float(cfg.annual_price_usd)
                if cfg.annual_price_usd is not None
                else round(monthly_val * 12 * (1.0 - ANNUAL_DISCOUNT), 2)
            )
            annual_monthly = round(annual_val / 12.0, 2)
            whens.append(
                f"WHEN '{pid}' THEN CASE WHEN s.billing_interval = 'annual' THEN {annual_monthly} ELSE {monthly_val} END"
            )
    return f"CASE COALESCE(s.plan_id, 'trial') {' '.join(whens)} ELSE 0.0 END"


def _effective_sub_status_sql() -> str:
    """Mirror compute_subscription_status() in SQL so filters/pagination match entitlements.py."""
    return """
    CASE
      WHEN COALESCE(s.plan_id, 'trial') = 'internal' THEN 'active'
      WHEN COALESCE(s.plan_id, 'trial') = 'trial' THEN
        CASE WHEN s.trial_ends_at IS NOT NULL AND now() >= s.trial_ends_at THEN 'expired' ELSE 'trialing' END
      WHEN s.current_period_end IS NOT NULL AND now() >= s.current_period_end THEN 'expired'
      WHEN s.status = 'canceled' THEN 'canceled'
      ELSE 'active'
    END
    """.strip()


def _billing_window_bounds_sql(table_alias: str = "gr", ts_col: str = "started_at") -> str:
    """Mirror get_billing_window() 30-day rolling windows in SQL."""
    secs = MONTHLY_WINDOW_DAYS * 86400
    return f"""
    (
      COALESCE(s.plan_id, 'trial') IN ('trial', 'internal')
      OR s.current_period_start IS NULL
      OR (
        {table_alias}.{ts_col} >= s.current_period_start + (
          floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - s.current_period_start))) / {secs})::int * interval '{MONTHLY_WINDOW_DAYS} days'
        )
        AND {table_alias}.{ts_col} < s.current_period_start + (
          (floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - s.current_period_start))) / {secs})::int + 1) * interval '{MONTHLY_WINDOW_DAYS} days'
        )
      )
    )
    """.strip()


def _format_plan_limits_summary(plan_id: str) -> str:
    cfg = get_plan(plan_id)
    posts = "unlimited" if cfg.scheduled_posts_per_period is None else f"{cfg.scheduled_posts_per_period} scheduled posts/mo"
    pg = "unlimited" if cfg.playground_runs_per_period is None else f"{cfg.playground_runs_per_period} playground runs/mo"
    slack = "Slack + Email approvals" if cfg.approval_slack else "Email approvals"
    return f"{posts}, {pg}, {slack}"


def change_user_plan(
    db: Session,
    target_user_id: str,
    actor_id: str,
    actor_email: str,
    plan_id: str,
    billing_interval: Optional[str],
    expected_plan_id: str,
    reset_quota_cycle: bool,
    reason: str,
    send_email: bool = True,
    admin_message: Optional[str] = None,
) -> Dict[str, Any]:
    """Atomically change a user's plan on subscriptions using expected_plan_id CAS."""
    clean_reason = reason.strip()
    if len(clean_reason) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "A reason is required."},
        )

    new_plan = plan_id.strip().lower()
    expected_plan = expected_plan_id.strip().lower()
    if new_plan not in PLANS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_plan", "message": f"Unknown plan '{plan_id}'."},
        )

    user_row = db.execute(
        text(
            'SELECT u.id::text AS id, u.email, COALESCE(NULLIF(TRIM(p.display_name), \'\'), u.name) AS display_name '
            'FROM neon_auth."user" u '
            'LEFT JOIN profiles p ON p.user_id = u.id::text '
            'WHERE u.id::text = :uid LIMIT 1'
        ),
        {"uid": target_user_id},
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "User not found."},
        )

    target_email = (user_row.email or "").strip()
    if new_plan == "internal" and target_email.lower() not in settings.admin_email_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "internal_plan_restricted",
                "message": "The internal plan can only be assigned to emails in ADMIN_EMAILS.",
            },
        )

    if new_plan in ("trial", "internal"):
        clean_interval: Optional[str] = None
    else:
        clean_interval = (billing_interval or "monthly").strip().lower()
        if clean_interval not in ("monthly", "annual"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_interval", "message": "Billing interval must be monthly or annual."},
            )

    sub = ensure_trial_subscription(db, target_user_id)
    before_state = {
        "plan_id": sub.plan_id,
        "status": sub.status,
        "billing_interval": sub.billing_interval,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "pending_plan_id": sub.pending_plan_id,
        "pending_billing_interval": sub.pending_billing_interval,
    }
    old_plan_id = sub.plan_id
    old_interval = sub.billing_interval

    new_sub_status = "trialing" if new_plan == "trial" else "active"
    new_tier = PLAN_TIER.get(new_plan, 0)
    pending_tier = PLAN_TIER.get(sub.pending_plan_id or "", -1)
    # Clear pending downgrade only if it conflicts with the new plan (same plan or higher/equal tier)
    clear_pending = bool(
        sub.pending_plan_id and (sub.pending_plan_id == new_plan or pending_tier >= new_tier or new_plan == "trial")
    )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    updated_row = db.execute(
        text(
            "UPDATE subscriptions "
            "SET plan_id = :new_plan, "
            "    status = :new_status, "
            "    billing_interval = :new_interval, "
            "    current_period_start = CASE WHEN :reset_quota THEN :now_utc ELSE current_period_start END, "
            "    pending_plan_id = CASE WHEN :clear_pending THEN NULL ELSE pending_plan_id END, "
            "    pending_billing_interval = CASE WHEN :clear_pending THEN NULL ELSE pending_billing_interval END, "
            "    provider = 'admin', "
            "    updated_at = :now_utc "
            "WHERE user_id = :uid AND plan_id = :expected_plan "
            "RETURNING plan_id, status, billing_interval, current_period_start, current_period_end, pending_plan_id, pending_billing_interval"
        ),
        {
            "uid": target_user_id,
            "new_plan": new_plan,
            "new_status": new_sub_status,
            "new_interval": clean_interval,
            "reset_quota": bool(reset_quota_cycle),
            "clear_pending": clear_pending,
            "expected_plan": expected_plan,
            "now_utc": now_utc,
        },
    ).fetchone()

    if not updated_row:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "plan_conflict",
                "message": "User's plan changed concurrently. Please refresh and try again.",
            },
        )

    plan_actually_changed = (old_plan_id != new_plan) or (old_interval != clean_interval)
    will_send_email = bool(send_email and plan_actually_changed and target_email)

    after_state = {
        "plan_id": updated_row.plan_id,
        "status": updated_row.status,
        "billing_interval": updated_row.billing_interval,
        "current_period_start": updated_row.current_period_start.isoformat() if updated_row.current_period_start else None,
        "current_period_end": updated_row.current_period_end.isoformat() if updated_row.current_period_end else None,
        "pending_plan_id": updated_row.pending_plan_id,
        "pending_billing_interval": updated_row.pending_billing_interval,
        "reset_quota_cycle": bool(reset_quota_cycle),
    }

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action="user.plan_changed",
        target_type="user",
        target_id=target_user_id,
        target_email=target_email or None,
        reason=clean_reason,
        before_state=before_state,
        after_state=after_state,
        email_status="pending" if will_send_email else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    invalidate_effective_plan_cache(target_user_id)
    invalidate_user_status_cache(target_user_id)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if will_send_email:
        old_name = PLANS[old_plan_id].name if old_plan_id in PLANS else old_plan_id
        new_name = PLANS[new_plan].name
        display_name = user_row.display_name or target_email.split("@")[0]
        email_res = send_user_notification(
            user_id=target_user_id,
            to_email=target_email,
            notification_type="plan_changed",
            payload={
                "display_name": display_name,
                "old_plan": old_name,
                "new_plan": new_name,
                "limits_summary": _format_plan_limits_summary(new_plan),
                "admin_message": (admin_message or "").strip(),
            },
            idempotency_key=f"plan_changed:{audit.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": target_user_id,
        "plan_id": updated_row.plan_id,
        "plan_name": PLANS[updated_row.plan_id].name,
        "billing_interval": updated_row.billing_interval,
        "current_period_start": updated_row.current_period_start.isoformat() if updated_row.current_period_start else None,
        "current_period_end": updated_row.current_period_end.isoformat() if updated_row.current_period_end else None,
        "email_status": email_status,
        "email_error": email_error,
    }


def set_subscription_end_date(
    db: Session,
    target_user_id: str,
    actor_id: str,
    actor_email: str,
    raw_end_date: str,
    reason: str,
    force: bool = False,
) -> Dict[str, Any]:
    """Set a user's subscription end date normalized to 23:59:59 UTC (no email sent)."""
    clean_reason = reason.strip()
    if len(clean_reason) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "Reason must be at least 5 characters."},
        )

    raw_str = raw_end_date.strip()
    try:
        if len(raw_str) == 10:
            parsed_date = datetime.date.fromisoformat(raw_str)
        else:
            dt = datetime.datetime.fromisoformat(raw_str.replace("Z", "+00:00"))
            if dt.tzinfo is not None:
                dt = dt.astimezone(datetime.timezone.utc)
            parsed_date = dt.date()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_date", "message": "Invalid date format. Use YYYY-MM-DD."},
        )

    normalized_end = datetime.datetime(
        parsed_date.year,
        parsed_date.month,
        parsed_date.day,
        23,
        59,
        59,
        tzinfo=datetime.timezone.utc,
    )
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    if normalized_end < now_utc and not force:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "date_in_past",
                "message": "End date is in the past. Enable force if setting an expired date is intended.",
            },
        )

    user_row = db.execute(
        text('SELECT id::text AS id, email FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": target_user_id},
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "User not found."},
        )

    sub = ensure_trial_subscription(db, target_user_id)
    before_state = {
        "plan_id": sub.plan_id,
        "status": sub.status,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }

    if sub.plan_id == "trial":
        sub.trial_ends_at = normalized_end
    else:
        sub.current_period_end = normalized_end
        if normalized_end > now_utc and sub.status == "expired":
            sub.status = "active"
    sub.updated_at = now_utc

    computed_after = compute_subscription_status(sub, now=now_utc)
    after_state = {
        "plan_id": sub.plan_id,
        "status": sub.status,
        "computed_status": computed_after,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "force": bool(force),
    }

    db.add(
        AdminAuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action="user.subscription_end_updated",
            target_type="user",
            target_id=target_user_id,
            target_email=user_row.email,
            reason=clean_reason,
            before_state=before_state,
            after_state=after_state,
            email_status="not_sent",
        )
    )
    db.commit()

    invalidate_effective_plan_cache(target_user_id)
    invalidate_admin_overview_cache()

    return {
        "id": target_user_id,
        "plan_id": sub.plan_id,
        "subscription_status": computed_after,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
    }


def list_admin_subscribers(
    db: Session,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    interval: Optional[str] = None,
    effective_status: Optional[str] = None,
    sort_by: str = "period_end",
    sort_dir: str = "asc",
    page: int = 1,
    page_size: int = 12,
) -> Dict[str, Any]:
    """Server-side paginated subscribers list + summary metrics."""
    page = max(1, page)
    page_size = max(1, min(50, page_size))
    offset = (page - 1) * page_size

    eff_sql = _effective_sub_status_sql()
    rate_sql = _monthly_rate_sql_case()
    limit_sql = _plan_limit_sql_case()
    win_sql = _billing_window_bounds_sql("gr", "started_at")
    counted_statuses_sql = ", ".join(f"'{s}'" for s in COUNTED_RUN_STATUSES)

    base_joins = """
        FROM neon_auth."user" u
        LEFT JOIN profiles p ON p.user_id = u.id::text
        LEFT JOIN subscriptions s ON s.user_id = u.id::text
    """
    scope_sql = f"""
        (
          ({eff_sql}) = 'active'
          OR EXISTS (
            SELECT 1 FROM payments pay
            WHERE pay.user_id = u.id::text AND pay.status = 'approved'
          )
        )
    """

    summary_row = db.execute(
        text(
            f"""
            SELECT
              COUNT(*) FILTER (
                WHERE COALESCE(s.plan_id, 'trial') IN ('starter', 'pro', 'business')
                  AND ({eff_sql}) = 'active'
              )::int AS paid_subscribers,
              COALESCE(SUM(
                CASE
                  WHEN COALESCE(s.plan_id, 'trial') IN ('starter', 'pro', 'business')
                    AND ({eff_sql}) = 'active'
                    AND COALESCE(p.account_status, 'active') = 'active'
                  THEN ({rate_sql})
                  ELSE 0.0
                END
              ), 0.0)::float AS estimated_mrr_usd,
              COUNT(*) FILTER (
                WHERE COALESCE(s.plan_id, 'trial') IN ('starter', 'pro', 'business')
                  AND ({eff_sql}) = 'active'
                  AND s.current_period_end IS NOT NULL
                  AND s.current_period_end > now()
                  AND s.current_period_end <= now() + interval '7 days'
              )::int AS expiring_7d,
              COUNT(*) FILTER (
                WHERE ({scope_sql})
                  AND (
                    ({eff_sql}) = 'expired'
                    OR (s.current_period_end IS NOT NULL AND s.current_period_end <= now())
                  )
              )::int AS overdue
            {base_joins}
            """
        )
    ).fetchone()

    where_clauses = [scope_sql]
    params: Dict[str, Any] = {"limit": page_size, "offset": offset}

    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        where_clauses.append("(u.email ILIKE :q OR COALESCE(p.display_name, u.name, '') ILIKE :q)")

    if plan and plan.strip():
        pl = plan.strip().lower()
        if pl not in PLANS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_plan", "message": "Invalid plan filter."},
            )
        params["plan_filter"] = pl
        where_clauses.append("COALESCE(s.plan_id, 'trial') = :plan_filter")

    if interval and interval.strip():
        iv = interval.strip().lower()
        if iv not in ("monthly", "annual"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_interval", "message": "Invalid interval filter."},
            )
        params["interval_filter"] = iv
        where_clauses.append("s.billing_interval = :interval_filter")

    if effective_status and effective_status.strip():
        es = effective_status.strip().lower()
        if es not in ("active", "expired", "canceled", "trialing"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_status", "message": "Invalid effective status filter."},
            )
        params["eff_filter"] = es
        where_clauses.append(f"({eff_sql}) = :eff_filter")

    where_sql = " AND ".join(where_clauses)
    usage_pct_sql = (
        f"CASE WHEN ({limit_sql}) IS NULL OR ({limit_sql}) = 0 THEN 0 "
        f"ELSE LEAST(100, ROUND((COALESCE(usage_q.scheduled_used, 0)::numeric / ({limit_sql})) * 100)::int) END"
    )

    direction = "DESC" if sort_dir.strip().lower() == "desc" else "ASC"
    if sort_by == "usage":
        order_sql = f"{usage_pct_sql} {direction}, COALESCE(usage_q.scheduled_used, 0) {direction}, u.\"createdAt\" DESC"
    else:
        order_sql = f"s.current_period_end {direction} NULLS LAST, u.\"createdAt\" DESC"

    total = int(
        db.execute(text(f"SELECT COUNT(*) {base_joins} WHERE {where_sql}"), params).scalar() or 0
    )

    rows = db.execute(
        text(
            f"""
            SELECT
                u.id::text AS user_id,
                COALESCE(NULLIF(TRIM(p.display_name), ''), u.name, split_part(u.email, '@', 1)) AS display_name,
                u.email AS email,
                COALESCE(p.account_status, 'active') AS account_status,
                COALESCE(s.plan_id, 'trial') AS plan_id,
                s.billing_interval AS billing_interval,
                s.current_period_start AS current_period_start,
                s.current_period_end AS current_period_end,
                s.trial_ends_at AS trial_ends_at,
                ({eff_sql}) AS effective_status,
                ({rate_sql})::float AS monthly_rate_usd,
                COALESCE(usage_q.scheduled_used, 0) AS scheduled_used,
                ({limit_sql}) AS scheduled_limit,
                ({usage_pct_sql}) AS usage_percent,
                EXISTS (
                  SELECT 1 FROM payments pay
                  WHERE pay.user_id = u.id::text AND pay.status = 'pending'
                ) AS has_pending_payment
            {base_joins}
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS scheduled_used
                FROM generation_runs gr
                WHERE gr.user_id = u.id::text
                  AND gr.usage_kind = 'scheduled'
                  AND gr.status IN ({counted_statuses_sql})
                  AND {win_sql}
            ) usage_q ON TRUE
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).fetchall()

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    items: List[Dict[str, Any]] = []
    for r in rows:
        plan_cfg = PLANS.get(r.plan_id)
        end_dt = r.trial_ends_at if r.plan_id == "trial" else r.current_period_end
        days_left: Optional[int] = None
        is_overdue = r.effective_status == "expired"
        if end_dt is not None:
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=datetime.timezone.utc)
            delta_secs = (end_dt - now_utc).total_seconds()
            days_left = max(0, math.ceil(delta_secs / 86400.0)) if delta_secs > 0 else 0
            if delta_secs <= 0:
                is_overdue = True

        items.append(
            {
                "id": r.user_id,
                "name": r.display_name,
                "email": r.email,
                "is_admin": (r.email or "").strip().lower() in settings.admin_email_set,
                "account_status": r.account_status,
                "plan_id": r.plan_id,
                "plan_name": plan_cfg.name if plan_cfg else r.plan_id,
                "billing_interval": r.billing_interval,
                "monthly_rate_usd": round(float(r.monthly_rate_usd or 0.0), 2),
                "current_period_start": r.current_period_start.isoformat() if r.current_period_start else None,
                "current_period_end": end_dt.isoformat() if end_dt else None,
                "days_left": days_left,
                "effective_status": r.effective_status,
                "is_overdue": is_overdue,
                "has_pending_payment": bool(r.has_pending_payment),
                "scheduled_used": int(r.scheduled_used or 0),
                "scheduled_limit": int(r.scheduled_limit) if r.scheduled_limit is not None else None,
                "usage_percent": int(r.usage_percent or 0),
            }
        )

    return {
        "summary": {
            "paid_subscribers": int(summary_row.paid_subscribers or 0) if summary_row else 0,
            "estimated_mrr_usd": round(float(summary_row.estimated_mrr_usd or 0.0), 2) if summary_row else 0.0,
            "expiring_7d": int(summary_row.expiring_7d or 0) if summary_row else 0,
            "overdue": int(summary_row.overdue or 0) if summary_row else 0,
        },
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def list_admin_usage(
    db: Session,
    view: str = "paid",
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 12,
) -> Dict[str, Any]:
    """Per-user usage aggregated in a single SQL query per page using get_billing_window rules."""
    if view not in ("paid", "trial"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_view", "message": "View must be paid or trial."},
        )

    page = max(1, page)
    page_size = max(1, min(50, page_size))
    offset = (page - 1) * page_size

    eff_sql = _effective_sub_status_sql()
    limit_sql = _plan_limit_sql_case()
    counted_statuses_sql = ", ".join(f"'{s}'" for s in COUNTED_RUN_STATUSES)
    gr_win_sql = _billing_window_bounds_sql("gr", "started_at")
    pub_win_sql = _billing_window_bounds_sql("pub", "published_at")
    llm_win_sql = _billing_window_bounds_sql("l", "created_at")

    base_joins = """
        FROM neon_auth."user" u
        LEFT JOIN profiles p ON p.user_id = u.id::text
        LEFT JOIN subscriptions s ON s.user_id = u.id::text
    """

    if view == "paid":
        where_clauses = [
            "COALESCE(s.plan_id, 'trial') IN ('starter', 'pro', 'business', 'internal')",
            f"({eff_sql}) = 'active'",
        ]
    else:
        where_clauses = [
            f"(COALESCE(s.plan_id, 'trial') = 'trial' OR ({eff_sql}) != 'active')",
        ]

    params: Dict[str, Any] = {"limit": page_size, "offset": offset}
    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        where_clauses.append("(u.email ILIKE :q OR COALESCE(p.display_name, u.name, '') ILIKE :q)")

    where_sql = " AND ".join(where_clauses)

    total = int(
        db.execute(text(f"SELECT COUNT(*) {base_joins} WHERE {where_sql}"), params).scalar() or 0
    )

    # Single SQL query per page: paginate users first, then GROUP BY aggregates via LATERAL joins
    rows = db.execute(
        text(
            f"""
            WITH paged_users AS (
                SELECT
                    u.id::text AS user_id,
                    COALESCE(NULLIF(TRIM(p.display_name), ''), u.name, split_part(u.email, '@', 1)) AS display_name,
                    u.email AS email,
                    COALESCE(p.account_status, 'active') AS account_status,
                    COALESCE(NULLIF(TRIM(p.timezone), ''), 'UTC') AS timezone,
                    COALESCE(s.plan_id, 'trial') AS plan_id,
                    s.billing_interval AS billing_interval,
                    s.trial_ends_at AS trial_ends_at,
                    s.current_period_start AS current_period_start,
                    ({eff_sql}) AS effective_status,
                    ({limit_sql}) AS scheduled_limit,
                    u."createdAt" AS created_at
                {base_joins}
                WHERE {where_sql}
                ORDER BY u."createdAt" DESC
                LIMIT :limit OFFSET :offset
            )
            SELECT
                s.*,
                COALESCE(gr_agg.posts_generated, 0)::int AS posts_generated,
                COALESCE(gr_agg.quota_used, 0)::int AS quota_used,
                COALESCE(gr_agg.failed_runs, 0)::int AS failed_runs,
                COALESCE(gr_agg.playground_today, 0)::int AS playground_today,
                COALESCE(pub_agg.posts_published, 0)::int AS posts_published,
                COALESCE(llm_agg.tokens_in, 0)::bigint AS tokens_in,
                COALESCE(llm_agg.tokens_out, 0)::bigint AS tokens_out,
                COALESCE(llm_agg.cost_micro_usd, 0)::bigint AS cost_micro_usd,
                COALESCE(today_agg.today_cost_micro_usd, 0)::bigint AS today_cost_micro_usd
            FROM paged_users s
            LEFT JOIN LATERAL (
                SELECT
                    COUNT(*) FILTER (WHERE gr.usage_kind = 'scheduled' AND gr.status IN ('succeeded', 'needs_review')) AS posts_generated,
                    COUNT(*) FILTER (WHERE gr.usage_kind = 'scheduled' AND gr.status IN ({counted_statuses_sql})) AS quota_used,
                    COUNT(*) FILTER (WHERE gr.status IN ('failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted')) AS failed_runs,
                    COUNT(*) FILTER (
                        WHERE gr.usage_kind = 'playground'
                          AND gr.status IN ({counted_statuses_sql})
                          AND gr.started_at >= date_trunc('day', now() AT TIME ZONE COALESCE(NULLIF(s.timezone, ''), 'UTC')) AT TIME ZONE COALESCE(NULLIF(s.timezone, ''), 'UTC')
                    ) AS playground_today
                FROM generation_runs gr
                WHERE gr.user_id = s.user_id
                  AND {gr_win_sql}
            ) gr_agg ON TRUE
            LEFT JOIN LATERAL (
                SELECT COUNT(*) AS posts_published
                FROM post_publications pub
                WHERE pub.user_id = s.user_id
                  AND pub.status = 'published'
                  AND {pub_win_sql}
            ) pub_agg ON TRUE
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(l.input_tokens), 0) AS tokens_in,
                    COALESCE(SUM(l.output_tokens), 0) AS tokens_out,
                    COALESCE(SUM(l.cost_micro_usd), 0) AS cost_micro_usd
                FROM llm_call_log l
                WHERE l.user_id = s.user_id
                  AND {llm_win_sql}
            ) llm_agg ON TRUE
            LEFT JOIN LATERAL (
                SELECT COALESCE(SUM(l2.cost_micro_usd), 0) AS today_cost_micro_usd
                FROM llm_call_log l2
                WHERE l2.user_id = s.user_id
                  AND l2.created_at >= date_trunc('day', now() AT TIME ZONE COALESCE(NULLIF(s.timezone, ''), 'UTC')) AT TIME ZONE COALESCE(NULLIF(s.timezone, ''), 'UTC')
            ) today_agg ON TRUE
            ORDER BY s.created_at DESC
            """
        ),
        params,
    ).fetchall()

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    items: List[Dict[str, Any]] = []
    for r in rows:
        plan_cfg = PLANS.get(r.plan_id, get_plan("trial"))
        sched_limit = plan_cfg.scheduled_posts_per_period
        quota_used = int(r.quota_used or 0)
        quota_pct = (
            min(100, round((quota_used / sched_limit) * 100))
            if sched_limit and sched_limit > 0
            else 0
        )

        trial_days_left: Optional[int] = None
        if r.plan_id == "trial" and r.trial_ends_at is not None:
            end_dt = r.trial_ends_at
            if end_dt.tzinfo is None:
                end_dt = end_dt.replace(tzinfo=datetime.timezone.utc)
            delta = (end_dt - now_utc).total_seconds()
            trial_days_left = max(0, math.ceil(delta / 86400.0)) if delta > 0 else 0

        items.append(
            {
                "id": r.user_id,
                "name": r.display_name,
                "email": r.email,
                "account_status": r.account_status,
                "plan_id": plan_cfg.id,
                "plan_name": plan_cfg.name,
                "effective_status": r.effective_status,
                "trial_days_left": trial_days_left,
                "posts_generated": int(r.posts_generated or 0),
                "posts_published": int(r.posts_published or 0),
                "failed_runs": int(r.failed_runs or 0),
                "tokens_in": int(r.tokens_in or 0),
                "tokens_out": int(r.tokens_out or 0),
                "cost_usd": round(int(r.cost_micro_usd or 0) / 1_000_000.0, 4),
                "quota_used": quota_used,
                "quota_limit": sched_limit,
                "quota_percent": quota_pct,
                "today_spend_usd": round(int(r.today_cost_micro_usd or 0) / 1_000_000.0, 4),
                "daily_spend_limit_usd": plan_cfg.daily_spend_limit_usd,
                "playground_today_used": int(r.playground_today or 0),
                "playground_daily_limit": plan_cfg.playground_runs_per_day,
            }
        )

    return {
        "view": view,
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
        "sources_note": {
            "billing_window": "30-day rolling windows from subscriptions.current_period_start (all-time for trial/internal), matching get_billing_window().",
            "posts_generated": "COUNT(generation_runs) where usage_kind='scheduled' and status IN ('succeeded','needs_review') in current window.",
            "quota_used": "COUNT(generation_runs) where usage_kind='scheduled' and status IN ('queued','started','running','succeeded','needs_review') vs plans.scheduled_posts_per_period.",
            "posts_published": "COUNT(post_publications) where status='published' in current window.",
            "failed_runs": "COUNT(generation_runs) where status IN ('failed','failed_quality','failed_error','timed_out','interrupted') in current window.",
            "tokens_and_cost": "SUM(llm_call_log.input_tokens, output_tokens, cost_micro_usd / 1,000,000) in current window.",
            "today_spend_usd": "SUM(llm_call_log.cost_micro_usd / 1,000,000) since midnight in profile.timezone vs plans.daily_spend_limit_usd.",
            "daily_rate_limit": "Today's playground runs in profile.timezone vs plans.playground_runs_per_day.",
        },
    }


def get_admin_plans_overview(db: Session) -> Dict[str, Any]:
    """Return read-only plans from plans.py with live subscriber counts from one SQL query."""
    eff_sql = _effective_sub_status_sql()
    rows = db.execute(
        text(
            f"""
            SELECT
                s.plan_id,
                COUNT(*)::int AS total_subscribers,
                COUNT(*) FILTER (WHERE ({eff_sql}) = 'active')::int AS active_subscribers
            FROM subscriptions s
            GROUP BY s.plan_id
            """
        )
    ).fetchall()
    counts_by_plan = {
        r.plan_id: {
            "total": int(r.total_subscribers or 0),
            "active": int(r.active_subscribers or 0),
        }
        for r in rows
    }

    items: List[Dict[str, Any]] = []
    for pid in (*PUBLIC_PLAN_ORDER, "internal"):
        cfg = PLANS[pid]
        c = counts_by_plan.get(pid, {"total": 0, "active": 0})
        items.append(
            {
                "id": cfg.id,
                "name": cfg.name,
                "is_public": cfg.is_public,
                "monthly_price_usd": cfg.monthly_price_usd,
                "monthly_price_pkr_approx": usd_to_pkr_approx(cfg.monthly_price_usd),
                "annual_price_usd": cfg.annual_price_usd,
                "annual_price_pkr_approx": usd_to_pkr_approx(cfg.annual_price_usd),
                "annual_monthly_equivalent_usd": cfg.annual_monthly_equivalent_usd,
                "plan_length_days": cfg.plan_length_days,
                "limits": {
                    "linkedin_profiles": cfg.linkedin_profiles,
                    "scheduled_posts_per_period": cfg.scheduled_posts_per_period,
                    "playground_runs_per_period": cfg.playground_runs_per_period,
                    "playground_runs_per_day": cfg.playground_runs_per_day,
                    "max_post_days_per_week": cfg.max_post_days_per_week,
                    "daily_spend_limit_usd": cfg.daily_spend_limit_usd,
                    "docs_token_limit": cfg.docs_token_limit,
                },
                "rate_limits": {
                    "api_per_min": PLAN_RATE_LIMITS["api"].get(pid),
                    "generate_per_hour": PLAN_RATE_LIMITS["generate"].get(pid),
                    "payment_submit_per_hour": PLAN_RATE_LIMITS["payment_submit"].get(pid),
                },
                "features": {
                    "approval_email": cfg.approval_email,
                    "approval_slack": cfg.approval_slack,
                    "analytics_level": cfg.analytics_level,
                    "support_label": cfg.support_label,
                },
                "subscribers": {
                    "total": c["total"],
                    "active": c["active"],
                },
            }
        )

    return {
        "currency": "USD",
        "pkr_per_usd": PKR_PER_USD,
        "annual_discount": ANNUAL_DISCOUNT,
        "rate_limit_windows": RATE_LIMIT_WINDOWS,
        "plans": items,
    }
