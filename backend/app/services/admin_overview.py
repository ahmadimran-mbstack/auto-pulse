"""Service layer for Phase 5: Super Admin Overview dashboard with 60s Redis cache."""

import datetime
import json
import logging
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.limiter import get_redis_client
from app.core.plans import (
    get_plan_entries,
    get_plans,
    get_public_plan_order,
    get_purchasable_plan_ids,
)

logger = logging.getLogger(__name__)

ADMIN_OVERVIEW_CACHE_KEY = "admin_overview:v1"
ADMIN_OVERVIEW_CACHE_TTL = 60


def invalidate_admin_overview_cache() -> None:
    """Delete the cached admin overview payload whenever an admin mutates state."""
    client = get_redis_client()
    if client is not None:
        try:
            client.delete(ADMIN_OVERVIEW_CACHE_KEY)
        except Exception as exc:
            logger.warning(f"Failed to invalidate admin overview cache: {exc}")


def _get_admin_dismissals(db: Session, admin_user_id: Optional[str]) -> Dict[str, datetime.datetime]:
    if not admin_user_id:
        return {}
    rows = db.execute(
        text(
            "SELECT alert_type, dismissed_at FROM admin_alert_dismissals WHERE admin_user_id = :uid"
        ),
        {"uid": admin_user_id},
    ).fetchall()
    return {str(r.alert_type): r.dismissed_at for r in rows if r.dismissed_at is not None}


def _apply_per_admin_alerts(
    db: Session,
    payload: Dict[str, Any],
    admin_user_id: Optional[str],
) -> Dict[str, Any]:
    dismissals = _get_admin_dismissals(db, admin_user_id)
    failed_dismissed_at = dismissals.get("failed_emails")
    pending_dismissed_at = dismissals.get("pending_payments")

    # Count only unresolved failed notification emails in the last 24h after dismissal
    failed_emails_count = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM email_logs f
                WHERE f.status = 'failed'
                  AND f.created_at >= now() - interval '24 hours'
                  AND (CAST(:dismissed_at AS timestamptz) IS NULL OR f.created_at > CAST(:dismissed_at AS timestamptz))
                  AND NOT EXISTS (
                      SELECT 1
                      FROM email_logs s
                      WHERE s.status = 'sent'
                        AND s.created_at > f.created_at
                        AND (
                            (f.idempotency_key IS NOT NULL AND s.idempotency_key = f.idempotency_key)
                            OR (s.to_email = f.to_email AND s.type = f.type)
                        )
                  )
                """
            ),
            {"dismissed_at": failed_dismissed_at},
        ).scalar()
        or 0
    )

    pending_alert_row = db.execute(
        text(
            """
            SELECT
                COUNT(*)::int AS cnt,
                COALESCE(SUM(amount_usd_cents), 0)::bigint AS usd_cents
            FROM payments
            WHERE status = 'pending'
              AND (CAST(:dismissed_at AS timestamptz) IS NULL OR submitted_at > CAST(:dismissed_at AS timestamptz))
            """
        ),
        {"dismissed_at": pending_dismissed_at},
    ).fetchone()

    kpis = dict(payload.get("kpis") or {})
    kpis["failed_emails_count"] = failed_emails_count
    kpis["pending_payments_alert_count"] = int(pending_alert_row.cnt or 0) if pending_alert_row else 0
    kpis["pending_payments_alert_usd"] = (
        round(int(pending_alert_row.usd_cents or 0) / 100.0, 2) if pending_alert_row else 0.0
    )

    # 24h email delivery metrics (median send time & failure rate)
    email_stats = db.execute(
        text(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_24h,
                COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_24h,
                COUNT(*) FILTER (WHERE status IN ('queued', 'sending'))::int AS queued_now,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_duration_ms)
                    FILTER (WHERE status = 'sent' AND total_duration_ms IS NOT NULL) AS median_send_ms
            FROM email_logs
            WHERE created_at >= now() - interval '24 hours'
            """
        )
    ).fetchone()
    sent_24h = int(email_stats.sent_24h or 0) if email_stats else 0
    failed_24h = int(email_stats.failed_24h or 0) if email_stats else 0
    finished_24h = sent_24h + failed_24h
    kpis["email_median_send_ms_24h"] = (
        int(round(float(email_stats.median_send_ms)))
        if (email_stats and email_stats.median_send_ms is not None)
        else None
    )
    kpis["email_failure_rate_24h"] = (
        round((failed_24h / finished_24h) * 100.0, 1) if finished_24h > 0 else 0.0
    )
    kpis["email_sent_24h"] = sent_24h
    kpis["email_failed_24h"] = failed_24h
    kpis["email_queued_now"] = int(email_stats.queued_now or 0) if email_stats else 0

    payload["kpis"] = kpis
    return payload


def dismiss_admin_alert(
    db: Session,
    admin_user_id: str,
    alert_type: str,
) -> datetime.datetime:
    """Persist per-admin dismissal timestamp for an overview alert banner."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    db.execute(
        text(
            """
            INSERT INTO admin_alert_dismissals (admin_user_id, alert_type, dismissed_at)
            VALUES (:uid, :atype, :ts)
            ON CONFLICT (admin_user_id, alert_type)
            DO UPDATE SET dismissed_at = EXCLUDED.dismissed_at
            """
        ),
        {"uid": admin_user_id, "atype": alert_type, "ts": now_utc},
    )
    db.commit()
    return now_utc


def get_admin_overview(
    db: Session,
    refresh: bool = False,
    admin_user_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Return cached or freshly computed UTC-based overview metrics, series, and queues."""
    client = get_redis_client()
    if not refresh and client is not None:
        try:
            raw = client.get(ADMIN_OVERVIEW_CACHE_KEY)
            if raw:
                cached = json.loads(raw)
                cached["cached"] = True
                return _apply_per_admin_alerts(db, cached, admin_user_id)
        except Exception as exc:
            logger.warning(f"Redis read failed for {ADMIN_OVERVIEW_CACHE_KEY}: {exc}")

    now_utc = datetime.datetime.now(datetime.timezone.utc)
    from app.services.admin_subscribers import _effective_sub_status_sql, _monthly_rate_sql_case

    eff_sql = _effective_sub_status_sql()
    rate_sql = _monthly_rate_sql_case()
    purchasable_ids = get_purchasable_plan_ids()
    paid_in_sql = (
        ", ".join("'" + pid.replace("'", "''") + "'" for pid in purchasable_ids)
        if purchasable_ids
        else "'__none__'"
    )

    # 1. Users & Subscribers KPIs (single SQL pass)
    user_sub_row = db.execute(
        text(
            f"""
            SELECT
                COUNT(*)::int AS total_users,
                COUNT(*) FILTER (
                    WHERE u."createdAt" >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                )::int AS new_users_month,
                COUNT(*) FILTER (WHERE COALESCE(p.account_status, 'active') = 'active')::int AS active_users,
                COUNT(*) FILTER (WHERE p.account_status = 'suspended')::int AS suspended_users,
                COUNT(*) FILTER (WHERE p.account_status = 'disabled')::int AS disabled_users,
                COUNT(*) FILTER (
                    WHERE COALESCE(s.plan_id, 'trial') IN ({paid_in_sql})
                      AND ({eff_sql}) = 'active'
                )::int AS paid_subscribers,
                COUNT(*) FILTER (
                    WHERE COALESCE(s.plan_id, 'trial') = 'trial'
                      AND ({eff_sql}) = 'trialing'
                )::int AS trial_users,
                COALESCE(SUM(
                    CASE
                        WHEN COALESCE(s.plan_id, 'trial') IN ({paid_in_sql})
                          AND ({eff_sql}) = 'active'
                          AND COALESCE(p.account_status, 'active') = 'active'
                        THEN ({rate_sql})
                        ELSE 0.0
                    END
                ), 0.0)::float AS estimated_mrr_usd,
                COUNT(*) FILTER (
                    WHERE COALESCE(s.plan_id, 'trial') IN ({paid_in_sql})
                      AND ({eff_sql}) = 'active'
                      AND s.current_period_end IS NOT NULL
                      AND s.current_period_end > now()
                      AND s.current_period_end <= now() + interval '7 days'
                )::int AS expiring_7d,
                COUNT(*) FILTER (
                    WHERE (
                      ({eff_sql}) = 'active'
                      OR EXISTS (SELECT 1 FROM payments pay WHERE pay.user_id = u.id::text AND pay.status = 'approved')
                    )
                    AND (
                      ({eff_sql}) = 'expired'
                      OR (s.current_period_end IS NOT NULL AND s.current_period_end <= now())
                    )
                )::int AS overdue
            FROM neon_auth."user" u
            LEFT JOIN profiles p ON p.user_id = u.id::text
            LEFT JOIN subscriptions s ON s.user_id = u.id::text
            """
        )
    ).fetchone()

    deleted_count = int(
        db.execute(text("SELECT COUNT(*)::int FROM deleted_accounts")).scalar() or 0
    )

    # 2. Payments KPIs
    pay_row = db.execute(
        text(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
                COALESCE(SUM(amount_usd_cents) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_usd_cents,
                COALESCE(SUM(amount_pkr) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_pkr,
                COALESCE(SUM(amount_usd_cents) FILTER (
                    WHERE status = 'approved'
                      AND reviewed_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                ), 0)::bigint AS revenue_month_usd_cents,
                COALESCE(SUM(amount_pkr) FILTER (
                    WHERE status = 'approved'
                      AND reviewed_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                ), 0)::bigint AS revenue_month_pkr,
                COALESCE(SUM(amount_usd_cents) FILTER (WHERE status = 'approved'), 0)::bigint AS revenue_all_usd_cents
            FROM payments
            """
        )
    ).fetchone()

    # 3. AI Cost & Generation KPIs (current UTC month & today UTC)
    llm_row = db.execute(
        text(
            """
            SELECT
                COALESCE(SUM(cost_micro_usd) FILTER (
                    WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                ), 0)::bigint AS cost_month_micro_usd,
                COALESCE(SUM(cost_micro_usd) FILTER (
                    WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                ), 0)::bigint AS cost_today_micro_usd,
                COALESCE(SUM(input_tokens + output_tokens) FILTER (
                    WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                ), 0)::bigint AS tokens_month
            FROM llm_call_log
            """
        )
    ).fetchone()

    runs_month_row = db.execute(
        text(
            """
            SELECT
                COUNT(*) FILTER (
                    WHERE usage_kind = 'scheduled' AND status IN ('succeeded', 'needs_review')
                )::int AS posts_generated_month,
                COUNT(*) FILTER (
                    WHERE status IN ('failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted')
                )::int AS failed_runs_month
            FROM generation_runs
            WHERE started_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
            """
        )
    ).fetchone()

    posts_published_month = int(
        db.execute(
            text(
                """
                SELECT COUNT(*)::int
                FROM post_publications
                WHERE status = 'published'
                  AND published_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                """
            )
        ).scalar()
        or 0
    )

    failed_emails_count = int(
        db.execute(text("SELECT COUNT(*)::int FROM email_logs WHERE status = 'failed'")).scalar() or 0
    )

    # 4. Daily 30-day UTC series (revenue vs AI cost, and generated/published/failed)
    series_rows = db.execute(
        text(
            """
            WITH days AS (
                SELECT generate_series(
                    ((now() AT TIME ZONE 'UTC')::date - 29),
                    (now() AT TIME ZONE 'UTC')::date,
                    interval '1 day'
                )::date AS d
            ),
            rev AS (
                SELECT (reviewed_at AT TIME ZONE 'UTC')::date AS d,
                       COALESCE(SUM(amount_usd_cents), 0)::bigint AS usd_cents
                FROM payments
                WHERE status = 'approved'
                  AND reviewed_at >= (((now() AT TIME ZONE 'UTC')::date - 29)::timestamp AT TIME ZONE 'UTC')
                GROUP BY 1
            ),
            cost AS (
                SELECT (created_at AT TIME ZONE 'UTC')::date AS d,
                       COALESCE(SUM(cost_micro_usd), 0)::bigint AS micro_usd
                FROM llm_call_log
                WHERE created_at >= (((now() AT TIME ZONE 'UTC')::date - 29)::timestamp AT TIME ZONE 'UTC')
                GROUP BY 1
            ),
            gen AS (
                SELECT (started_at AT TIME ZONE 'UTC')::date AS d,
                       COUNT(*) FILTER (WHERE usage_kind = 'scheduled' AND status IN ('succeeded', 'needs_review'))::int AS generated,
                       COUNT(*) FILTER (WHERE status IN ('failed', 'failed_quality', 'failed_error', 'timed_out', 'interrupted'))::int AS failed
                FROM generation_runs
                WHERE started_at >= (((now() AT TIME ZONE 'UTC')::date - 29)::timestamp AT TIME ZONE 'UTC')
                GROUP BY 1
            ),
            pub AS (
                SELECT (published_at AT TIME ZONE 'UTC')::date AS d,
                       COUNT(*)::int AS published
                FROM post_publications
                WHERE status = 'published'
                  AND published_at >= (((now() AT TIME ZONE 'UTC')::date - 29)::timestamp AT TIME ZONE 'UTC')
                GROUP BY 1
            )
            SELECT
                days.d,
                COALESCE(rev.usd_cents, 0)::bigint AS rev_usd_cents,
                COALESCE(cost.micro_usd, 0)::bigint AS cost_micro_usd,
                COALESCE(gen.generated, 0)::int AS generated,
                COALESCE(pub.published, 0)::int AS published,
                COALESCE(gen.failed, 0)::int AS failed
            FROM days
            LEFT JOIN rev ON rev.d = days.d
            LEFT JOIN cost ON cost.d = days.d
            LEFT JOIN gen ON gen.d = days.d
            LEFT JOIN pub ON pub.d = days.d
            ORDER BY days.d ASC
            """
        )
    ).fetchall()

    daily_series: List[Dict[str, Any]] = []
    for r in series_rows:
        daily_series.append(
            {
                "date": r.d.isoformat(),
                "short_date": r.d.strftime("%b %d"),
                "revenue_usd": round(int(r.rev_usd_cents or 0) / 100.0, 2),
                "cost_usd": round(int(r.cost_micro_usd or 0) / 1_000_000.0, 4),
                "generated": int(r.generated or 0),
                "published": int(r.published or 0),
                "failed": int(r.failed or 0),
            }
        )

    # 5. Plan breakdown (total and active from subscriptions)
    plan_rows = db.execute(
        text(
            f"""
            SELECT
                s.plan_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ({eff_sql}) = 'active')::int AS active
            FROM subscriptions s
            GROUP BY s.plan_id
            """
        )
    ).fetchall()
    plan_map = {r.plan_id: {"total": int(r.total or 0), "active": int(r.active or 0)} for r in plan_rows}
    plans_map = get_plans()
    entries_map = get_plan_entries()
    ordered_ids = list(get_public_plan_order()) + [
        pid for pid, e in entries_map.items() if not e.config.is_public and e.is_active
    ]
    plan_breakdown = [
        {
            "plan_id": pid,
            "plan_name": plans_map[pid].name,
            "total": plan_map.get(pid, {}).get("total", 0),
            "active": plan_map.get(pid, {}).get("active", 0),
        }
        for pid in ordered_ids
        if pid in plans_map
    ]

    # 6. Pending payments queue (oldest 5 first) & recent 10 audit logs
    pending_rows = db.execute(
        text(
            """
            SELECT p.id, p.user_id, COALESCE(u.email, p.user_email, p.user_id) AS user_email,
                   p.plan_id, p.billing_interval, p.amount_usd_cents, p.amount_pkr,
                   p.method, p.transaction_id, p.submitted_at
            FROM payments p
            LEFT JOIN neon_auth."user" u ON u.id::text = p.user_id
            WHERE p.status = 'pending'
            ORDER BY p.submitted_at ASC
            LIMIT 5
            """
        )
    ).fetchall()

    audit_rows = db.execute(
        text(
            """
            SELECT id, actor_email, action, target_type, target_id, target_email, reason, email_status, created_at
            FROM admin_audit_logs
            ORDER BY created_at DESC
            LIMIT 10
            """
        )
    ).fetchall()

    payload: Dict[str, Any] = {
        "cached": False,
        "generated_at": now_utc.isoformat(),
        "month_utc": now_utc.strftime("%Y-%m"),
        "kpis": {
            "total_users": int(user_sub_row.total_users or 0) if user_sub_row else 0,
            "new_users_month": int(user_sub_row.new_users_month or 0) if user_sub_row else 0,
            "active_users": int(user_sub_row.active_users or 0) if user_sub_row else 0,
            "suspended_users": int(user_sub_row.suspended_users or 0) if user_sub_row else 0,
            "disabled_users": int(user_sub_row.disabled_users or 0) if user_sub_row else 0,
            "deleted_accounts": deleted_count,
            "paid_subscribers": int(user_sub_row.paid_subscribers or 0) if user_sub_row else 0,
            "trial_users": int(user_sub_row.trial_users or 0) if user_sub_row else 0,
            "estimated_mrr_usd": round(float(user_sub_row.estimated_mrr_usd or 0.0), 2) if user_sub_row else 0.0,
            "expiring_7d": int(user_sub_row.expiring_7d or 0) if user_sub_row else 0,
            "overdue": int(user_sub_row.overdue or 0) if user_sub_row else 0,
            "pending_payments_count": int(pay_row.pending_count or 0) if pay_row else 0,
            "pending_payments_usd": round(int(pay_row.pending_usd_cents or 0) / 100.0, 2) if pay_row else 0.0,
            "pending_payments_pkr": int(pay_row.pending_pkr or 0) if pay_row else 0,
            "revenue_month_usd": round(int(pay_row.revenue_month_usd_cents or 0) / 100.0, 2) if pay_row else 0.0,
            "revenue_month_pkr": int(pay_row.revenue_month_pkr or 0) if pay_row else 0,
            "revenue_all_time_usd": round(int(pay_row.revenue_all_usd_cents or 0) / 100.0, 2) if pay_row else 0.0,
            "cost_month_usd": round(int(llm_row.cost_month_micro_usd or 0) / 1_000_000.0, 4) if llm_row else 0.0,
            "cost_today_usd": round(int(llm_row.cost_today_micro_usd or 0) / 1_000_000.0, 4) if llm_row else 0.0,
            "tokens_month": int(llm_row.tokens_month or 0) if llm_row else 0,
            "posts_generated_month": int(runs_month_row.posts_generated_month or 0) if runs_month_row else 0,
            "posts_published_month": posts_published_month,
            "failed_runs_month": int(runs_month_row.failed_runs_month or 0) if runs_month_row else 0,
            "failed_emails_count": failed_emails_count,
        },
        "daily_series": daily_series,
        "plan_breakdown": plan_breakdown,
        "pending_payments": [
            {
                "id": str(r.id),
                "user_id": r.user_id,
                "user_email": r.user_email,
                "plan_name": plans_map[r.plan_id].name if r.plan_id in plans_map else r.plan_id,
                "billing_interval": r.billing_interval,
                "amount_usd": round(int(r.amount_usd_cents) / 100.0, 2),
                "amount_pkr": int(r.amount_pkr),
                "method": r.method,
                "transaction_id": r.transaction_id,
                "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            }
            for r in pending_rows
        ],
        "recent_audit_logs": [
            {
                "id": str(a.id),
                "actor_email": a.actor_email,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "target_email": a.target_email,
                "reason": a.reason,
                "email_status": a.email_status,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_rows
        ],
    }

    if client is not None:
        try:
            client.setex(ADMIN_OVERVIEW_CACHE_KEY, ADMIN_OVERVIEW_CACHE_TTL, json.dumps(payload))
        except Exception as exc:
            logger.warning(f"Redis write failed for {ADMIN_OVERVIEW_CACHE_KEY}: {exc}")

    return _apply_per_admin_alerts(db, payload, admin_user_id)
