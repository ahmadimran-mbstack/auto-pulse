"""Service layer for Step 2: Admin plan editor (CRUD, archive/restore, concurrency, revalidation)."""

import datetime
import json
import logging
import re
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.plans import (
    ANNUAL_DISCOUNT,
    MONTHLY_WINDOW_DAYS,
    PKR_PER_USD,
    PLAN_RATE_LIMITS,
    RATE_LIMIT_WINDOWS,
    TRIAL_DAYS,
    bump_plans_version,
    cents_to_usd,
    compute_annual_cents,
    usd_to_pkr_approx,
)
from app.models.admin import AdminAuditLog
from app.services.admin_overview import invalidate_admin_overview_cache
from app.services.admin_subscribers import _effective_sub_status_sql

logger = logging.getLogger(__name__)

_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$")
_VALID_ANALYTICS = {"none", "basic", "full"}
_VALID_TIERS = tuple(k for k in PLAN_RATE_LIMITS["api"].keys() if k != "expired")
REVALIDATE_WARNING_MSG = "Saved, but public pages may take up to 60 seconds to update."


def revalidate_frontend_plans() -> Optional[str]:
    """Call frontend POST /api/revalidate-plans after plan writes; return warning string on failure."""
    secret = (settings.REVALIDATE_SECRET or "").strip()
    if not secret:
        logger.warning("REVALIDATE_SECRET is not set; skipping instant frontend plan revalidation.")
        return REVALIDATE_WARNING_MSG

    target_url = (
        settings.FRONTEND_REVALIDATE_URL.strip()
        if settings.FRONTEND_REVALIDATE_URL and settings.FRONTEND_REVALIDATE_URL.strip()
        else f"{settings.FRONTEND_URL.rstrip('/')}/api/revalidate-plans"
    )
    req = urllib.request.Request(
        target_url,
        data=b"{}",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-revalidate-secret": secret,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            if 200 <= resp.status < 300:
                return None
            logger.warning(f"Frontend revalidate-plans returned HTTP {resp.status}")
            return REVALIDATE_WARNING_MSG
    except Exception as exc:
        logger.warning(f"Frontend revalidate-plans failed ({target_url}): {exc}")
        return REVALIDATE_WARNING_MSG


def _clean_extra_features(items: Optional[List[str]]) -> List[str]:
    if not items:
        return []
    cleaned: List[str] = []
    for raw in items:
        s = str(raw or "").strip()
        if s:
            cleaned.append(s[:160])
    return cleaned[:20]


def _serialize_admin_plan_row(row, counts: Dict[str, int], ref_count: int) -> Dict[str, Any]:
    monthly_cents = int(row.monthly_price_cents) if row.monthly_price_cents is not None else None
    annual_cents = int(row.annual_price_cents) if row.annual_price_cents is not None else None
    equiv_cents = (
        int(row.annual_monthly_equivalent_cents)
        if row.annual_monthly_equivalent_cents is not None
        else None
    )
    spend_cents = int(row.daily_spend_limit_cents) if row.daily_spend_limit_cents is not None else None

    monthly_usd = cents_to_usd(monthly_cents)
    annual_usd = cents_to_usd(annual_cents)
    equiv_usd = cents_to_usd(equiv_cents)
    spend_usd = cents_to_usd(spend_cents)
    tier = str(row.rate_limit_tier)
    is_purchasable = bool(
        row.is_active
        and row.is_public
        and not row.is_system
        and monthly_cents is not None
        and monthly_cents > 0
    )

    return {
        "id": str(row.id),
        "name": str(row.name),
        "is_public": bool(row.is_public),
        "is_active": bool(row.is_active),
        "is_popular": bool(row.is_popular),
        "is_system": bool(row.is_system),
        "is_purchasable": is_purchasable,
        "sort_order": int(row.sort_order),
        "version": int(row.version),
        "rate_limit_tier": tier,
        "extra_features": list(row.extra_features or []),
        "monthly_price_cents": monthly_cents,
        "annual_price_cents": annual_cents,
        "annual_monthly_equivalent_cents": equiv_cents,
        "daily_spend_limit_cents": spend_cents,
        "monthly_price_usd": monthly_usd,
        "monthly_price_pkr_approx": usd_to_pkr_approx(monthly_usd),
        "annual_price_usd": annual_usd,
        "annual_price_pkr_approx": usd_to_pkr_approx(annual_usd),
        "annual_monthly_equivalent_usd": equiv_usd,
        "plan_length_days": int(row.plan_length_days),
        "limits": {
            "linkedin_profiles": row.linkedin_profiles,
            "scheduled_posts_per_period": row.scheduled_posts_per_period,
            "playground_runs_per_period": row.playground_runs_per_period,
            "playground_runs_per_day": row.playground_runs_per_day,
            "max_post_days_per_week": row.max_post_days_per_week,
            "daily_spend_limit_usd": spend_usd,
            "docs_token_limit": row.docs_token_limit,
        },
        "rate_limits": {
            "api_per_min": PLAN_RATE_LIMITS["api"].get(tier),
            "generate_per_hour": PLAN_RATE_LIMITS["generate"].get(tier),
            "payment_submit_per_hour": PLAN_RATE_LIMITS["payment_submit"].get(tier),
        },
        "features": {
            "approval_email": bool(row.approval_email),
            "approval_slack": bool(row.approval_slack),
            "analytics_level": str(row.analytics_level),
            "support_label": str(row.support_label),
        },
        "subscribers": {
            "total": counts.get("total", 0),
            "active": counts.get("active", 0),
            "paid": counts.get("active", 0) if is_purchasable else 0,
        },
        "references_count": ref_count,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "updated_by": row.updated_by,
    }


def _count_plan_references(db: Session, plan_id: str) -> int:
    row = db.execute(
        text(
            """
            SELECT (
                (SELECT COUNT(*) FROM subscriptions WHERE plan_id = :pid OR pending_plan_id = :pid)
                + (SELECT COUNT(*) FROM payments WHERE plan_id = :pid)
            )::int AS refs
            """
        ),
        {"pid": plan_id},
    ).scalar()
    return int(row or 0)


def _count_active_purchasable_excluding(db: Session, exclude_id: str) -> int:
    row = db.execute(
        text(
            """
            SELECT COUNT(*)::int
            FROM plans
            WHERE id != :pid
              AND is_active = true
              AND is_public = true
              AND is_system = false
              AND monthly_price_cents IS NOT NULL
              AND monthly_price_cents > 0
            """
        ),
        {"pid": exclude_id},
    ).scalar()
    return int(row or 0)


def _snapshot_plan_row(row) -> Dict[str, Any]:
    return {
        "id": row.id,
        "name": row.name,
        "is_public": bool(row.is_public),
        "is_active": bool(row.is_active),
        "is_popular": bool(row.is_popular),
        "is_system": bool(row.is_system),
        "monthly_price_cents": row.monthly_price_cents,
        "annual_price_cents": row.annual_price_cents,
        "annual_monthly_equivalent_cents": row.annual_monthly_equivalent_cents,
        "plan_length_days": row.plan_length_days,
        "linkedin_profiles": row.linkedin_profiles,
        "scheduled_posts_per_period": row.scheduled_posts_per_period,
        "playground_runs_per_period": row.playground_runs_per_period,
        "playground_runs_per_day": row.playground_runs_per_day,
        "max_post_days_per_week": row.max_post_days_per_week,
        "approval_email": bool(row.approval_email),
        "approval_slack": bool(row.approval_slack),
        "docs_token_limit": row.docs_token_limit,
        "analytics_level": row.analytics_level,
        "support_label": row.support_label,
        "daily_spend_limit_cents": row.daily_spend_limit_cents,
        "sort_order": row.sort_order,
        "rate_limit_tier": row.rate_limit_tier,
        "extra_features": list(row.extra_features or []),
        "version": row.version,
    }


def list_admin_plans(db: Session) -> Dict[str, Any]:
    """Return all plans from DB with live subscriber and reference counts."""
    eff_sql = _effective_sub_status_sql()
    sub_rows = db.execute(
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
        r.plan_id: {"total": int(r.total_subscribers or 0), "active": int(r.active_subscribers or 0)}
        for r in sub_rows
    }

    ref_rows = db.execute(
        text(
            """
            SELECT pid, SUM(cnt)::int AS refs
            FROM (
                SELECT plan_id AS pid, COUNT(*) AS cnt FROM subscriptions GROUP BY plan_id
                UNION ALL
                SELECT pending_plan_id AS pid, COUNT(*) AS cnt FROM subscriptions WHERE pending_plan_id IS NOT NULL GROUP BY pending_plan_id
                UNION ALL
                SELECT plan_id AS pid, COUNT(*) AS cnt FROM payments GROUP BY plan_id
            ) x
            GROUP BY pid
            """
        )
    ).fetchall()
    refs_by_plan = {r.pid: int(r.refs or 0) for r in ref_rows}

    plan_rows = db.execute(
        text("SELECT * FROM plans ORDER BY sort_order ASC, id ASC")
    ).fetchall()

    items = [
        _serialize_admin_plan_row(
            r,
            counts_by_plan.get(r.id, {"total": 0, "active": 0}),
            refs_by_plan.get(r.id, 0),
        )
        for r in plan_rows
    ]

    return {
        "currency": "USD",
        "pkr_per_usd": PKR_PER_USD,
        "annual_discount": ANNUAL_DISCOUNT,
        "trial_days": TRIAL_DAYS,
        "rate_limit_windows": RATE_LIMIT_WINDOWS,
        "rate_limit_tiers": list(_VALID_TIERS),
        "plans": items,
    }


def _validate_plan_fields(
    *,
    name: str,
    monthly_price_cents: Optional[int],
    analytics_level: str,
    rate_limit_tier: str,
    support_label: str,
    reason: str,
) -> None:
    if len(reason.strip()) < 2:
        raise HTTPException(status_code=400, detail={"code": "invalid_reason", "message": "Reason is required."})
    if len(name.strip()) < 2:
        raise HTTPException(status_code=400, detail={"code": "invalid_name", "message": "Plan name must be at least 2 characters."})
    if monthly_price_cents is not None and monthly_price_cents < 0:
        raise HTTPException(status_code=400, detail={"code": "invalid_price", "message": "Monthly price cannot be negative."})
    if analytics_level not in _VALID_ANALYTICS:
        raise HTTPException(status_code=400, detail={"code": "invalid_analytics", "message": "Analytics level must be none, basic, or full."})
    if rate_limit_tier not in _VALID_TIERS:
        raise HTTPException(status_code=400, detail={"code": "invalid_tier", "message": "Invalid rate limit tier."})
    if not support_label.strip():
        raise HTTPException(status_code=400, detail={"code": "invalid_support", "message": "Support label is required."})


def create_admin_plan(
    db: Session,
    actor_id: str,
    actor_email: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    slug = str(data.get("id") or "").strip().lower()
    if not _SLUG_RE.match(slug) or "--" in slug:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invalid_slug",
                "message": "Slug must use lowercase letters, numbers, and single hyphens (e.g. agency-plus).",
            },
        )
    name = str(data.get("name") or "").strip()
    monthly_cents = data.get("monthly_price_cents")
    analytics_level = str(data.get("analytics_level") or "basic").strip().lower()
    rate_limit_tier = str(data.get("rate_limit_tier") or "starter").strip().lower()
    support_label = str(data.get("support_label") or "email").strip()
    reason = str(data.get("reason") or "").strip()

    _validate_plan_fields(
        name=name,
        monthly_price_cents=monthly_cents,
        analytics_level=analytics_level,
        rate_limit_tier=rate_limit_tier,
        support_label=support_label,
        reason=reason,
    )

    annual_cents, equiv_cents = compute_annual_cents(monthly_cents)
    extra_features = _clean_extra_features(data.get("extra_features"))
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    try:
        row = db.execute(
            text(
                """
                INSERT INTO plans (
                    id, name, is_public, monthly_price_cents, annual_price_cents,
                    annual_monthly_equivalent_cents, plan_length_days, linkedin_profiles,
                    scheduled_posts_per_period, playground_runs_per_period, playground_runs_per_day,
                    max_post_days_per_week, approval_email, approval_slack, docs_token_limit,
                    analytics_level, support_label, daily_spend_limit_cents, sort_order,
                    is_active, is_popular, is_system, rate_limit_tier, extra_features,
                    version, updated_at, updated_by
                )
                VALUES (
                    :id, :name, :is_public, :monthly_cents, :annual_cents,
                    :equiv_cents, :plan_length_days, :linkedin_profiles,
                    :scheduled_posts_per_period, :playground_runs_per_period, :playground_runs_per_day,
                    :max_post_days_per_week, :approval_email, :approval_slack, :docs_token_limit,
                    :analytics_level, :support_label, :daily_spend_limit_cents, :sort_order,
                    :is_active, :is_popular, false, :rate_limit_tier, CAST(:extra_features AS jsonb),
                    1, :now_utc, :actor_email
                )
                RETURNING *
                """
            ),
            {
                "id": slug,
                "name": name,
                "is_public": bool(data.get("is_public", True)),
                "monthly_cents": monthly_cents,
                "annual_cents": annual_cents,
                "equiv_cents": equiv_cents,
                "plan_length_days": MONTHLY_WINDOW_DAYS,
                "linkedin_profiles": data.get("linkedin_profiles", 1),
                "scheduled_posts_per_period": data.get("scheduled_posts_per_period"),
                "playground_runs_per_period": data.get("playground_runs_per_period"),
                "playground_runs_per_day": data.get("playground_runs_per_day"),
                "max_post_days_per_week": data.get("max_post_days_per_week"),
                "approval_email": bool(data.get("approval_email", True)),
                "approval_slack": bool(data.get("approval_slack", False)),
                "docs_token_limit": data.get("docs_token_limit", 0),
                "analytics_level": analytics_level,
                "support_label": support_label,
                "daily_spend_limit_cents": data.get("daily_spend_limit_cents"),
                "sort_order": int(data.get("sort_order", 10)),
                "is_active": bool(data.get("is_active", True)),
                "is_popular": bool(data.get("is_popular", False)),
                "rate_limit_tier": rate_limit_tier,
                "extra_features": json.dumps(extra_features),
                "now_utc": now_utc,
                "actor_email": actor_email,
            },
        ).fetchone()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "plan_exists", "message": f"Plan slug '{slug}' already exists."},
        )

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action="plan.created",
        target_type="plan",
        target_id=slug,
        reason=reason,
        before_state=None,
        after_state=_snapshot_plan_row(row),
    )
    db.add(audit)
    db.commit()

    bump_plans_version()
    invalidate_admin_overview_cache()
    warning = revalidate_frontend_plans()
    return {
        "plan": _serialize_admin_plan_row(row, {"total": 0, "active": 0}, 0),
        "revalidate_warning": warning,
    }


def update_admin_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_email: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    clean_id = plan_id.strip().lower()
    existing = db.execute(text("SELECT * FROM plans WHERE id = :id"), {"id": clean_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Plan not found."})

    # Enforce locked fields if caller supplied conflicting values
    if "id" in data and data["id"] is not None and str(data["id"]).strip().lower() != clean_id:
        raise HTTPException(status_code=400, detail={"code": "locked_field", "message": "Plan slug cannot be changed."})
    if "is_system" in data and data["is_system"] is not None and bool(data["is_system"]) != bool(existing.is_system):
        raise HTTPException(status_code=400, detail={"code": "locked_field", "message": "System flag cannot be changed."})
    if "plan_length_days" in data and data["plan_length_days"] is not None and int(data["plan_length_days"]) != int(existing.plan_length_days):
        raise HTTPException(status_code=400, detail={"code": "locked_field", "message": "Plan length days is locked."})

    expected_version = data.get("expected_version")
    if expected_version is None:
        raise HTTPException(status_code=400, detail={"code": "missing_version", "message": "expected_version is required."})

    name = str(data.get("name", existing.name)).strip()
    is_public = bool(data.get("is_public", existing.is_public))
    is_active = bool(data.get("is_active", existing.is_active))
    is_popular = bool(data.get("is_popular", existing.is_popular))
    monthly_cents = data["monthly_price_cents"] if "monthly_price_cents" in data else existing.monthly_price_cents
    analytics_level = str(data.get("analytics_level", existing.analytics_level)).strip().lower()
    rate_limit_tier = str(data.get("rate_limit_tier", existing.rate_limit_tier)).strip().lower()
    support_label = str(data.get("support_label", existing.support_label)).strip()
    reason = str(data.get("reason") or "").strip()

    _validate_plan_fields(
        name=name,
        monthly_price_cents=monthly_cents,
        analytics_level=analytics_level,
        rate_limit_tier=rate_limit_tier,
        support_label=support_label,
        reason=reason,
    )

    if existing.is_system and not is_active:
        raise HTTPException(
            status_code=400,
            detail={"code": "system_plan_locked", "message": "System plans cannot be archived or deleted."},
        )

    will_be_purchasable = bool(
        is_active and is_public and not existing.is_system and monthly_cents is not None and monthly_cents > 0
    )
    was_purchasable = bool(
        existing.is_active
        and existing.is_public
        and not existing.is_system
        and existing.monthly_price_cents is not None
        and existing.monthly_price_cents > 0
    )
    if was_purchasable and not will_be_purchasable:
        if _count_active_purchasable_excluding(db, clean_id) == 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "last_purchasable_plan", "message": "Cannot archive or hide the last active purchasable plan."},
            )

    annual_cents, equiv_cents = compute_annual_cents(monthly_cents)
    extra_features = (
        _clean_extra_features(data["extra_features"])
        if "extra_features" in data and data["extra_features"] is not None
        else list(existing.extra_features or [])
    )
    now_utc = datetime.datetime.now(datetime.timezone.utc)

    updated = db.execute(
        text(
            """
            UPDATE plans
            SET name = :name,
                is_public = :is_public,
                is_active = :is_active,
                is_popular = :is_popular,
                monthly_price_cents = :monthly_cents,
                annual_price_cents = :annual_cents,
                annual_monthly_equivalent_cents = :equiv_cents,
                linkedin_profiles = :linkedin_profiles,
                scheduled_posts_per_period = :scheduled_posts_per_period,
                playground_runs_per_period = :playground_runs_per_period,
                playground_runs_per_day = :playground_runs_per_day,
                max_post_days_per_week = :max_post_days_per_week,
                approval_email = :approval_email,
                approval_slack = :approval_slack,
                docs_token_limit = :docs_token_limit,
                analytics_level = :analytics_level,
                support_label = :support_label,
                daily_spend_limit_cents = :daily_spend_limit_cents,
                sort_order = :sort_order,
                rate_limit_tier = :rate_limit_tier,
                extra_features = CAST(:extra_features AS jsonb),
                version = version + 1,
                updated_at = :now_utc,
                updated_by = :actor_email
            WHERE id = :id AND version = :expected_version
            RETURNING *
            """
        ),
        {
            "id": clean_id,
            "expected_version": int(expected_version),
            "name": name,
            "is_public": is_public,
            "is_active": is_active,
            "is_popular": is_popular,
            "monthly_cents": monthly_cents,
            "annual_cents": annual_cents,
            "equiv_cents": equiv_cents,
            "linkedin_profiles": data["linkedin_profiles"] if "linkedin_profiles" in data else existing.linkedin_profiles,
            "scheduled_posts_per_period": data["scheduled_posts_per_period"] if "scheduled_posts_per_period" in data else existing.scheduled_posts_per_period,
            "playground_runs_per_period": data["playground_runs_per_period"] if "playground_runs_per_period" in data else existing.playground_runs_per_period,
            "playground_runs_per_day": data["playground_runs_per_day"] if "playground_runs_per_day" in data else existing.playground_runs_per_day,
            "max_post_days_per_week": data["max_post_days_per_week"] if "max_post_days_per_week" in data else existing.max_post_days_per_week,
            "approval_email": bool(data.get("approval_email", existing.approval_email)),
            "approval_slack": bool(data.get("approval_slack", existing.approval_slack)),
            "docs_token_limit": data["docs_token_limit"] if "docs_token_limit" in data else existing.docs_token_limit,
            "analytics_level": analytics_level,
            "support_label": support_label,
            "daily_spend_limit_cents": data["daily_spend_limit_cents"] if "daily_spend_limit_cents" in data else existing.daily_spend_limit_cents,
            "sort_order": int(data.get("sort_order", existing.sort_order)),
            "rate_limit_tier": rate_limit_tier,
            "extra_features": json.dumps(extra_features),
            "now_utc": now_utc,
            "actor_email": actor_email,
        },
    ).fetchone()

    if not updated:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "version_conflict", "message": "This plan was edited concurrently. Refresh and try again."},
        )

    action = "plan.updated"
    if existing.is_active and not updated.is_active:
        action = "plan.archived"
    elif not existing.is_active and updated.is_active:
        action = "plan.restored"

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        target_type="plan",
        target_id=clean_id,
        reason=reason,
        before_state=_snapshot_plan_row(existing),
        after_state=_snapshot_plan_row(updated),
    )
    db.add(audit)
    db.commit()

    bump_plans_version()
    invalidate_admin_overview_cache()
    warning = revalidate_frontend_plans()

    all_after = list_admin_plans(db)["plans"]
    serialized = next((p for p in all_after if p["id"] == clean_id), None)
    return {"plan": serialized, "revalidate_warning": warning}


def delete_admin_plan(
    db: Session,
    plan_id: str,
    actor_id: str,
    actor_email: str,
    reason: str,
    confirm_slug: Optional[str],
    expected_version: Optional[int],
) -> Dict[str, Any]:
    clean_id = plan_id.strip().lower()
    if len(reason.strip()) < 2:
        raise HTTPException(status_code=400, detail={"code": "invalid_reason", "message": "Reason is required."})

    existing = db.execute(text("SELECT * FROM plans WHERE id = :id"), {"id": clean_id}).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Plan not found."})
    if existing.is_system:
        raise HTTPException(status_code=400, detail={"code": "system_plan_locked", "message": "System plans cannot be deleted."})

    refs = _count_plan_references(db, clean_id)
    if refs > 0:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "plan_in_use",
                "message": f"Plan has {refs} subscription or payment reference(s) and can only be archived.",
            },
        )

    if (confirm_slug or "").strip().lower() != clean_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "confirm_slug_mismatch", "message": f"Type '{clean_id}' to confirm deletion."},
        )

    was_purchasable = bool(
        existing.is_active
        and existing.is_public
        and not existing.is_system
        and existing.monthly_price_cents is not None
        and existing.monthly_price_cents > 0
    )
    if was_purchasable and _count_active_purchasable_excluding(db, clean_id) == 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "last_purchasable_plan", "message": "Cannot delete the last active purchasable plan."},
        )

    params: Dict[str, Any] = {"id": clean_id}
    ver_clause = ""
    if expected_version is not None:
        ver_clause = " AND version = :ver"
        params["ver"] = int(expected_version)

    deleted = db.execute(
        text(f"DELETE FROM plans WHERE id = :id{ver_clause} RETURNING id"),
        params,
    ).fetchone()
    if not deleted:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": "version_conflict", "message": "Plan changed concurrently."})

    audit = AdminAuditLog(
        actor_id=actor_id,
        actor_email=actor_email,
        action="plan.deleted",
        target_type="plan",
        target_id=clean_id,
        reason=reason.strip(),
        before_state=_snapshot_plan_row(existing),
        after_state=None,
    )
    db.add(audit)
    db.commit()

    bump_plans_version()
    invalidate_admin_overview_cache()
    warning = revalidate_frontend_plans()
    return {"deleted": True, "id": clean_id, "revalidate_warning": warning}
