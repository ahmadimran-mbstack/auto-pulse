"""Service layer for Super Admin user management, status changes, deletion, and email resends."""

import datetime
from email.message import EmailMessage
import logging
from typing import Any, Dict, List, Optional
import uuid

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.plans import get_plan, get_plans
from app.models.admin import AdminAuditLog, DeletedAccount, EmailLog
from app.models.post import GenerationRun
from app.models.profile import Profile
from app.models.slack import SlackIntegration
from app.models.social_connection import SocialConnection
from app.models.subscription import Payment, Subscription
from app.services.account_deletion import delete_user_account
from app.services.account_status import invalidate_user_status_cache
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.email import send_smtp_message
from app.services.entitlements import (
    compute_subscription_status,
    invalidate_effective_plan_cache,
)
from app.services.notifications import render_notification_template, send_user_notification
from app.services.quota import get_billing_window, get_user_usage_counts

logger = logging.getLogger(__name__)


def _plan_limit_sql_case() -> str:
    """Build SQL CASE expression for scheduled_posts_per_period from get_plans() (fallback ELSE 3)."""
    whens = []
    for pid, cfg in get_plans().items():
        safe_pid = pid.replace("'", "''")
        if cfg.scheduled_posts_per_period is None:
            whens.append(f"WHEN '{safe_pid}' THEN NULL")
        else:
            whens.append(f"WHEN '{safe_pid}' THEN {int(cfg.scheduled_posts_per_period)}")
    if not whens:
        return "3"
    return f"CASE COALESCE(s.plan_id, 'trial') {' '.join(whens)} ELSE 3 END"


_PAYMENT_STATE_SQL = """
CASE
  WHEN COALESCE(s.plan_id, 'trial') = 'internal' THEN 'paid'
  WHEN COALESCE(s.plan_id, 'trial') = 'trial' THEN
    CASE WHEN s.trial_ends_at IS NOT NULL AND now() >= s.trial_ends_at THEN 'expired' ELSE 'trial' END
  WHEN s.current_period_end IS NOT NULL AND now() >= s.current_period_end THEN 'expired'
  WHEN s.status = 'canceled' THEN 'canceled'
  ELSE 'paid'
END
""".strip()


def list_admin_users(
    db: Session,
    search: Optional[str] = None,
    plan: Optional[str] = None,
    account_status: Optional[str] = None,
    payment_state: Optional[str] = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 12,
) -> Dict[str, Any]:
    """Server-side filtered, sorted, and paginated list of users starting from neon_auth.user."""
    page = max(1, page)
    page_size = max(1, min(50, page_size))
    offset = (page - 1) * page_size

    where_clauses: List[str] = ["1=1"]
    params: Dict[str, Any] = {"limit": page_size, "offset": offset}

    if search and search.strip():
        params["q"] = f"%{search.strip()}%"
        where_clauses.append(
            "(u.email ILIKE :q OR COALESCE(p.display_name, u.name, '') ILIKE :q)"
        )

    plans_map = get_plans()
    if plan and plan.strip():
        clean_plan = plan.strip().lower()
        if clean_plan not in plans_map:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_plan", "message": "Unknown plan filter."},
            )
        params["plan_filter"] = clean_plan
        where_clauses.append("COALESCE(s.plan_id, 'trial') = :plan_filter")

    if account_status and account_status.strip():
        clean_status = account_status.strip().lower()
        if clean_status not in ("active", "suspended", "disabled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_status", "message": "Invalid account status filter."},
            )
        params["status_filter"] = clean_status
        where_clauses.append("COALESCE(p.account_status, 'active') = :status_filter")

    if payment_state and payment_state.strip():
        clean_ps = payment_state.strip().lower()
        if clean_ps not in ("paid", "trial", "expired", "canceled"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "invalid_payment_state", "message": "Invalid payment state filter."},
            )
        params["payment_state_filter"] = clean_ps
        where_clauses.append(f"({_PAYMENT_STATE_SQL}) = :payment_state_filter")

    where_sql = " AND ".join(where_clauses)
    limit_sql = _plan_limit_sql_case()
    usage_pct_sql = (
        f"CASE WHEN ({limit_sql}) IS NULL OR ({limit_sql}) = 0 THEN 0 "
        f"ELSE LEAST(100, ROUND((COALESCE(usage_q.scheduled_used, 0)::numeric / ({limit_sql})) * 100)::int) END"
    )

    direction = "ASC" if sort_dir.strip().lower() == "asc" else "DESC"
    if sort_by == "name":
        order_sql = f"LOWER(COALESCE(p.display_name, u.name, u.email)) {direction}, u.\"createdAt\" DESC"
    elif sort_by == "usage":
        order_sql = f"{usage_pct_sql} {direction}, COALESCE(usage_q.scheduled_used, 0) {direction}, u.\"createdAt\" DESC"
    else:
        order_sql = f'u."createdAt" {direction}'

    base_joins = """
        FROM neon_auth."user" u
        LEFT JOIN profiles p ON p.user_id = u.id::text
        LEFT JOIN subscriptions s ON s.user_id = u.id::text
        LEFT JOIN social_connections sc ON sc.user_id = u.id::text AND sc.provider = 'linkedin'
    """

    total = int(
        db.execute(
            text(f"SELECT COUNT(*) {base_joins} WHERE {where_sql}"),
            params,
        ).scalar()
        or 0
    )

    rows = db.execute(
        text(
            f"""
            SELECT
                u.id::text AS user_id,
                COALESCE(NULLIF(TRIM(p.display_name), ''), u.name, split_part(u.email, '@', 1)) AS display_name,
                u.email AS email,
                u."emailVerified" AS email_verified,
                u."createdAt" AS created_at,
                COALESCE(p.account_status, 'active') AS account_status,
                COALESCE(s.plan_id, 'trial') AS plan_id,
                ({_PAYMENT_STATE_SQL}) AS payment_state,
                COALESCE(usage_q.scheduled_used, 0) AS monthly_usage_used,
                ({limit_sql}) AS monthly_usage_limit,
                ({usage_pct_sql}) AS monthly_usage_percent,
                (sc.id IS NOT NULL AND sc.status = 'active') AS linkedin_connected,
                sc.expires_at AS linkedin_expires_at
            {base_joins}
            LEFT JOIN LATERAL (
                SELECT COUNT(*)::int AS scheduled_used
                FROM generation_runs gr
                WHERE gr.user_id = u.id::text
                  AND gr.usage_kind = 'scheduled'
                  AND gr.status IN ('queued', 'started', 'running', 'succeeded', 'needs_review')
                  AND (
                    COALESCE(s.plan_id, 'trial') IN ('trial', 'internal')
                    OR s.current_period_start IS NULL
                    OR (
                      gr.started_at >= s.current_period_start + (
                        floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - s.current_period_start))) / 2592000)::int * interval '30 days'
                      )
                      AND gr.started_at < s.current_period_start + (
                        (floor(GREATEST(0, EXTRACT(EPOCH FROM (now() - s.current_period_start))) / 2592000)::int + 1) * interval '30 days'
                      )
                    )
                  )
            ) usage_q ON TRUE
            WHERE {where_sql}
            ORDER BY {order_sql}
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    ).fetchall()

    admin_emails = settings.admin_email_set
    items: List[Dict[str, Any]] = []
    for r in rows:
        plan_cfg = plans_map.get(r.plan_id)
        email_lower = (r.email or "").strip().lower()
        items.append(
            {
                "id": r.user_id,
                "name": r.display_name,
                "email": r.email,
                "email_verified": bool(r.email_verified),
                "is_admin": email_lower in admin_emails,
                "plan_id": r.plan_id,
                "plan_name": plan_cfg.name if plan_cfg else r.plan_id,
                "payment_state": r.payment_state,
                "account_status": r.account_status,
                "monthly_usage_used": int(r.monthly_usage_used or 0),
                "monthly_usage_limit": int(r.monthly_usage_limit) if r.monthly_usage_limit is not None else None,
                "monthly_usage_percent": int(r.monthly_usage_percent or 0),
                "linkedin_connected": bool(r.linkedin_connected),
                "linkedin_expires_at": r.linkedin_expires_at.isoformat() if r.linkedin_expires_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
        )

    total_pages = max(1, (total + page_size - 1) // page_size)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


def get_admin_user_detail(db: Session, user_id: str) -> Dict[str, Any]:
    """Return full admin detail view for one user."""
    user_row = db.execute(
        text(
            'SELECT id::text AS id, name, email, "emailVerified" AS email_verified, "createdAt" AS created_at '
            'FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'
        ),
        {"uid": user_id},
    ).fetchone()

    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "User not found."},
        )

    profile = db.scalars(select(Profile).where(Profile.user_id == user_id)).first()
    sub = db.scalars(select(Subscription).where(Subscription.user_id == user_id)).first()
    if sub is None:
        sub_obj = Subscription(user_id=user_id, plan_id="trial", status="trialing")
    else:
        sub_obj = sub

    plans_map = get_plans()
    plan_cfg = plans_map.get(sub_obj.plan_id) or get_plan("trial")
    computed_status = compute_subscription_status(sub_obj)
    usage_counts = get_user_usage_counts(db, user_id, sub_obj)
    win_start, win_end = get_billing_window(sub_obj)

    linkedin = db.scalars(
        select(SocialConnection).where(
            SocialConnection.user_id == user_id,
            SocialConnection.provider == "linkedin",
        )
    ).first()
    slack = db.scalars(select(SlackIntegration).where(SlackIntegration.user_id == user_id)).first()

    runs_rows = db.execute(
        text(
            """
            SELECT
                gr.id::text AS id,
                gr.run_date,
                gr.run_type,
                gr.usage_kind,
                gr.status,
                gr.duration,
                gr.search_calls,
                gr.llm_calls,
                gr.tokens_in,
                gr.tokens_out,
                gr.error_code,
                gr.error_detail,
                gr.started_at,
                gr.finished_at,
                COALESCE(SUM(l.cost_micro_usd), 0)::bigint AS cost_micro_usd
            FROM generation_runs gr
            LEFT JOIN llm_call_log l ON l.run_id = gr.id
            WHERE gr.user_id = :uid
            GROUP BY gr.id
            ORDER BY gr.started_at DESC
            LIMIT 15
            """
        ),
        {"uid": user_id},
    ).fetchall()

    payments = list(
        db.scalars(
            select(Payment).where(Payment.user_id == user_id).order_by(desc(Payment.submitted_at)).limit(20)
        ).all()
    )
    email_logs = list(
        db.scalars(
            select(EmailLog).where(EmailLog.user_id == user_id).order_by(desc(EmailLog.created_at)).limit(30)
        ).all()
    )
    audit_logs = list(
        db.scalars(
            select(AdminAuditLog)
            .where(AdminAuditLog.target_id == user_id)
            .order_by(desc(AdminAuditLog.created_at))
            .limit(30)
        ).all()
    )

    email_lower = (user_row.email or "").strip().lower()
    display_name = (
        profile.display_name.strip()
        if profile and profile.display_name and profile.display_name.strip()
        else (user_row.name or (user_row.email.split("@")[0] if user_row.email else "User"))
    )

    scheduled_limit = plan_cfg.scheduled_posts_per_period
    scheduled_used = usage_counts["scheduled_used"]
    usage_pct = (
        min(100, round((scheduled_used / scheduled_limit) * 100))
        if scheduled_limit and scheduled_limit > 0
        else 0
    )

    return {
        "summary": {
            "id": user_row.id,
            "name": display_name,
            "email": user_row.email,
            "email_verified": bool(user_row.email_verified),
            "is_admin": email_lower in settings.admin_email_set,
            "account_status": profile.account_status if profile else "active",
            "status_reason": profile.status_reason if profile else None,
            "status_changed_at": profile.status_changed_at.isoformat() if profile and profile.status_changed_at else None,
            "status_changed_by": profile.status_changed_by if profile else None,
            "created_at": user_row.created_at.isoformat() if user_row.created_at else None,
            "onboarding_complete": bool(profile and profile.onboarding_completed_at is not None),
            "timezone": profile.timezone if profile else None,
        },
        "billing": {
            "plan_id": plan_cfg.id,
            "plan_name": plan_cfg.name,
            "subscription_status": computed_status,
            "billing_interval": sub_obj.billing_interval,
            "trial_ends_at": sub_obj.trial_ends_at.isoformat() if sub_obj.trial_ends_at else None,
            "current_period_start": sub_obj.current_period_start.isoformat() if sub_obj.current_period_start else None,
            "current_period_end": sub_obj.current_period_end.isoformat() if sub_obj.current_period_end else None,
            "pending_plan_id": sub_obj.pending_plan_id,
            "pending_billing_interval": sub_obj.pending_billing_interval,
        },
        "quota": {
            "scheduled_used": scheduled_used,
            "scheduled_limit": scheduled_limit,
            "usage_percent": usage_pct,
            "playground_used": usage_counts["playground_used"],
            "playground_limit": plan_cfg.playground_runs_per_period,
            "playground_today_used": usage_counts["playground_today_used"],
            "playground_daily_limit": plan_cfg.playground_runs_per_day,
            "docs_tokens_used": usage_counts["docs_tokens_used"],
            "docs_token_limit": plan_cfg.docs_token_limit,
            "window_start": win_start.isoformat() if win_start else None,
            "window_end": win_end.isoformat() if win_end else None,
        },
        "connections": {
            "linkedin": {
                "connected": bool(linkedin and linkedin.status == "active"),
                "status": linkedin.status if linkedin else "not_connected",
                "account_name": linkedin.account_name if linkedin else None,
                "expires_at": linkedin.expires_at.isoformat() if linkedin and linkedin.expires_at else None,
                "connected_at": linkedin.connected_at.isoformat() if linkedin and linkedin.connected_at else None,
            },
            "slack": {
                "connected": bool(slack and slack.status == "connected"),
                "status": slack.status if slack else "disconnected",
                "team_name": slack.team_name if slack else None,
                "last_error": slack.last_error if slack else None,
                "connected_at": slack.created_at.isoformat() if slack else None,
            },
        },
        "runs": [
            {
                "id": r.id,
                "run_date": r.run_date.isoformat() if r.run_date else None,
                "run_type": r.run_type,
                "usage_kind": r.usage_kind,
                "status": r.status,
                "duration": r.duration,
                "search_calls": r.search_calls,
                "llm_calls": r.llm_calls,
                "tokens_in": r.tokens_in,
                "tokens_out": r.tokens_out,
                "cost_usd": round((r.cost_micro_usd or 0) / 1_000_000.0, 6),
                "error_code": r.error_code,
                "error_detail": r.error_detail,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            }
            for r in runs_rows
        ],
        "payments": [
            {
                "id": str(p.id),
                "plan_id": p.plan_id,
                "billing_interval": p.billing_interval,
                "amount_usd": round(p.amount_usd_cents / 100.0, 2),
                "amount_pkr": p.amount_pkr,
                "method": p.method,
                "transaction_id": p.transaction_id,
                "status": p.status,
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "reviewed_by": p.reviewed_by,
                "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
                "reject_reason": p.reject_reason,
            }
            for p in payments
        ],
        "email_logs": [
            {
                "id": str(e.id),
                "to_email": e.to_email,
                "type": e.type,
                "status": e.status,
                "error": e.error,
                "attempts": e.attempts,
                "provider": e.provider,
                "provider_message_id": e.provider_message_id,
                "provider_response_ms": e.provider_response_ms,
                "total_duration_ms": e.total_duration_ms,
                "next_attempt_at": e.next_attempt_at.isoformat() if e.next_attempt_at else None,
                "sent_at": e.sent_at.isoformat() if e.sent_at else None,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in email_logs
        ],
        "audit_logs": [
            {
                "id": str(a.id),
                "actor_email": a.actor_email,
                "action": a.action,
                "reason": a.reason,
                "before_state": a.before_state,
                "after_state": a.after_state,
                "email_status": a.email_status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_logs
        ],
    }


def change_user_status(
    db: Session,
    target_user_id: str,
    actor_id: str,
    actor_email: str,
    new_status: str,
    expected_status: str,
    reason: str,
    send_email: bool = True,
    admin_message: Optional[str] = None,
) -> Dict[str, Any]:
    """Atomically change a user's account_status, pause/cancel work on suspend/disable, audit, and notify."""
    clean_reason = reason.strip()
    if len(clean_reason) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "A reason is required."},
        )
    if new_status not in ("active", "suspended", "disabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_status", "message": "Status must be active, suspended, or disabled."},
        )
    if expected_status not in ("active", "suspended", "disabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_status", "message": "Invalid expected status."},
        )
    if target_user_id == actor_id and new_status in ("suspended", "disabled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "self_action_forbidden", "message": "You cannot suspend or disable your own account."},
        )

    user_row = db.execute(
        text('SELECT id::text AS id, name, email FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": target_user_id},
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "User not found."},
        )

    target_email = (user_row.email or "").strip()
    target_email_lower = target_email.lower()
    if target_email_lower in settings.admin_email_set and new_status in ("suspended", "disabled"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "protected_admin",
                "message": "Accounts listed in ADMIN_EMAILS cannot be suspended or disabled.",
            },
        )

    # Ensure a profiles row exists before the atomic compare-and-swap
    db.execute(
        text(
            "INSERT INTO profiles (user_id, display_name, account_status) "
            "VALUES (:uid, :name, 'active') "
            "ON CONFLICT (user_id) DO NOTHING"
        ),
        {"uid": target_user_id, "name": (user_row.name or "")[:80] or None},
    )

    updated_profile = db.execute(
        text(
            "UPDATE profiles "
            "SET account_status = :new_status, "
            "    status_reason = :reason, "
            "    status_changed_at = now(), "
            "    status_changed_by = :actor_email, "
            "    updated_at = now() "
            "WHERE user_id = :uid AND account_status = :expected_status "
            "RETURNING display_name, account_status"
        ),
        {
            "uid": target_user_id,
            "new_status": new_status,
            "expected_status": expected_status,
            "reason": clean_reason,
            "actor_email": actor_email,
        },
    ).fetchone()

    if not updated_profile:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "status_conflict",
                "message": "User status changed concurrently. Please refresh and try again.",
            },
        )

    side_effects: Dict[str, int] = {}
    if new_status in ("suspended", "disabled"):
        gen_res = db.execute(
            text(
                "UPDATE generation_runs "
                "SET cancel_requested = true, status = 'cancelled', finished_at = COALESCE(finished_at, now()) "
                "WHERE user_id = :uid AND status IN ('queued', 'started', 'running')"
            ),
            {"uid": target_user_id},
        )
        pg_res = db.execute(
            text(
                "UPDATE playground_runs "
                "SET cancel_requested = true, status = 'cancelled', finished_at = COALESCE(finished_at, now()) "
                "WHERE user_id = :uid AND status IN ('queued', 'started', 'running')"
            ),
            {"uid": target_user_id},
        )
        app_res = db.execute(
            text(
                "UPDATE approvals "
                "SET expires_at = now() "
                "WHERE user_id = :uid AND decision IS NULL AND expires_at > now()"
            ),
            {"uid": target_user_id},
        )
        post_res = db.execute(
            text(
                "UPDATE posts "
                "SET status = 'expired', updated_at = now() "
                "WHERE user_id = :uid "
                "  AND is_test IS FALSE "
                "  AND (approval_source IS NULL OR approval_source != 'playground') "
                "  AND status IN ('draft', 'awaiting_approval', 'approved')"
            ),
            {"uid": target_user_id},
        )
        # Never touch publications in 'publishing' or marked 'outcome_unknown'
        pub_res = db.execute(
            text(
                "UPDATE post_publications "
                "SET status = 'failed', error_code = 'account_suspended', "
                "    error_detail = 'Account status changed by admin', updated_at = now() "
                "WHERE user_id = :uid AND status = 'pending'"
            ),
            {"uid": target_user_id},
        )
        side_effects = {
            "cancelled_generation_runs": gen_res.rowcount or 0,
            "cancelled_playground_runs": pg_res.rowcount or 0,
            "cancelled_approvals": app_res.rowcount or 0,
            "expired_posts": post_res.rowcount or 0,
            "cancelled_publications": pub_res.rowcount or 0,
        }

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=f"user.status_{new_status}",
        target_type="user",
        target_id=target_user_id,
        target_email=target_email or None,
        reason=clean_reason,
        before_state={"account_status": expected_status},
        after_state={"account_status": new_status, **side_effects},
        email_status="pending" if (send_email and new_status != expected_status and target_email) else "not_sent",
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    invalidate_user_status_cache(target_user_id)
    invalidate_effective_plan_cache(target_user_id)
    invalidate_admin_overview_cache()

    email_status = "not_sent"
    email_error: Optional[str] = None
    if send_email and new_status != expected_status and target_email:
        tpl_type = "reactivated" if new_status == "active" else new_status
        display_name = updated_profile.display_name or user_row.name or target_email.split("@")[0]
        email_res = send_user_notification(
            user_id=target_user_id,
            to_email=target_email,
            notification_type=tpl_type,
            payload={
                "display_name": display_name,
                "admin_message": (admin_message or "").strip(),
            },
            idempotency_key=f"status:{audit.id}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")
        audit.email_status = email_status
        db.commit()

    return {
        "id": target_user_id,
        "account_status": new_status,
        "email_status": email_status,
        "email_error": email_error,
        "side_effects": side_effects,
    }


def admin_delete_user(
    db: Session,
    target_user_id: str,
    actor_id: str,
    actor_email: str,
    confirm_email: str,
    reason: str,
    send_email: bool = True,
    admin_message: Optional[str] = None,
) -> Dict[str, Any]:
    """Hard-delete a user via shared account_deletion service, write audit log, and notify."""
    clean_reason = reason.strip()
    if len(clean_reason) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_reason", "message": "A reason is required."},
        )
    if target_user_id == actor_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "self_action_forbidden", "message": "You cannot delete your own account from the admin panel."},
        )

    user_row = db.execute(
        text('SELECT id::text AS id, name, email FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": target_user_id},
    ).fetchone()
    if not user_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "User not found."},
        )

    target_email = (user_row.email or "").strip()
    target_name = user_row.name or (target_email.split("@")[0] if target_email else "User")
    if target_email.lower() in settings.admin_email_set:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "protected_admin",
                "message": "Accounts listed in ADMIN_EMAILS cannot be deleted.",
            },
        )
    if confirm_email.strip() != target_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "email_mismatch",
                "message": "The typed email does not match the user's email address.",
            },
        )

    profile = db.scalars(select(Profile).where(Profile.user_id == target_user_id)).first()
    if profile and profile.display_name:
        target_name = profile.display_name

    del_result = delete_user_account(
        db=db,
        user_id=target_user_id,
        user_email=target_email,
        deleted_by=actor_email,
        reason=clean_reason,
        record_deleted_account=True,
    )

    email_status = "not_sent"
    email_error: Optional[str] = None
    if send_email and target_email:
        email_res = send_user_notification(
            user_id=target_user_id,
            to_email=target_email,
            notification_type="account_deleted",
            payload={
                "display_name": target_name,
                "admin_message": (admin_message or "").strip(),
            },
            idempotency_key=f"deleted:{target_user_id}:{uuid.uuid4()}",
            db=db,
        )
        email_status = email_res["status"]
        email_error = email_res.get("error")

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action="user.deleted",
        target_type="user",
        target_id=target_user_id,
        target_email=target_email,
        reason=clean_reason,
        before_state={"email": target_email, "name": target_name},
        after_state={
            "deleted_counts": del_result.get("deleted_counts", {}),
            "revoke_warnings": del_result.get("revoke_warnings", []),
        },
        email_status=email_status,
    )
    db.add(audit)
    db.commit()
    invalidate_admin_overview_cache()

    return {
        "deleted": True,
        "id": target_user_id,
        "email": target_email,
        "deleted_counts": del_result.get("deleted_counts", {}),
        "email_status": email_status,
        "email_error": email_error,
    }


def list_deleted_accounts(
    db: Session,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 12,
) -> Dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(50, page_size))
    offset = (page - 1) * page_size

    stmt = select(DeletedAccount)
    count_stmt = select(func.count(DeletedAccount.id))
    if search and search.strip():
        q = f"%{search.strip()}%"
        stmt = stmt.where(DeletedAccount.email.ilike(q))
        count_stmt = count_stmt.where(DeletedAccount.email.ilike(q))

    total = int(db.scalar(count_stmt) or 0)
    rows = list(
        db.scalars(
            stmt.order_by(desc(DeletedAccount.deleted_at)).offset(offset).limit(page_size)
        ).all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "email": r.email,
                "user_id": r.user_id,
                "deleted_at": r.deleted_at.isoformat() if r.deleted_at else None,
                "deleted_by": r.deleted_by,
                "reason": r.reason,
            }
            for r in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


def remove_deleted_account(
    db: Session,
    email: str,
    actor_id: str,
    actor_email: str,
) -> Dict[str, Any]:
    clean_email = email.strip().lower()
    if not clean_email or "@" not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "invalid_email", "message": "A valid email address is required."},
        )

    deleted_row = db.execute(
        text(
            "DELETE FROM deleted_accounts WHERE lower(email) = :email "
            "RETURNING id, email, user_id, deleted_by, reason"
        ),
        {"email": clean_email},
    ).fetchone()

    if not deleted_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Deleted account record not found."},
        )

    db.add(
        AdminAuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action="user.allow_resignup",
            target_type="deleted_account",
            target_id=deleted_row.user_id,
            target_email=deleted_row.email,
            reason="Allowed deleted email to sign up again",
            before_state={"email": deleted_row.email, "deleted_by": deleted_row.deleted_by},
            after_state={"removed": True},
        )
    )
    db.commit()
    if deleted_row.user_id:
        invalidate_user_status_cache(deleted_row.user_id)
    invalidate_admin_overview_cache()

    return {"removed": True, "email": deleted_row.email}


def resend_user_email_log(
    db: Session,
    user_id: str,
    log_id: str,
    actor_id: str,
    actor_email: str,
) -> Dict[str, Any]:
    try:
        log_uuid = uuid.UUID(log_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Notification log not found."},
        )

    row = db.scalars(
        select(EmailLog).where(EmailLog.id == log_uuid, EmailLog.user_id == user_id)
    ).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Notification log not found."},
        )

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    row.status = "queued"
    row.error = None
    row.locked_at = None
    row.next_attempt_at = now_utc
    row.max_attempts = max(int(row.max_attempts or 5), int(row.attempts or 0) + 5)
    row.updated_at = now_utc

    db.add(
        AdminAuditLog(
            actor_id=actor_id,
            actor_email=actor_email,
            action="user.notification_resend",
            target_type="user",
            target_id=user_id,
            target_email=row.to_email,
            reason=f"Re-queued email log {row.id} ({row.type})",
            after_state={"attempts": row.attempts, "status": "queued"},
            email_status="queued",
        )
    )
    db.commit()
    db.refresh(row)
    invalidate_admin_overview_cache()

    from app.services.notifications import _trigger_outbox_drain
    _trigger_outbox_drain()

    return {
        "id": str(row.id),
        "status": row.status,
        "attempts": row.attempts,
        "provider_message_id": row.provider_message_id,
        "error": row.error,
    }
