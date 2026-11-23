"""Subscription entitlements, trial clock, and plan management."""

import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.plans import (
    ANNUAL_DISCOUNT,
    ANNUAL_PERIOD_DAYS,
    MONTHLY_WINDOW_DAYS,
    PKR_PER_USD,
    PLANS,
    PUBLIC_PLAN_ORDER,
    TRIAL_DAYS,
    get_plan,
    usd_to_pkr_approx,
)
from app.models.profile import Profile
from app.models.subscription import Subscription


def _utc_now(now: Optional[datetime.datetime] = None) -> datetime.datetime:
    if now is None:
        return datetime.datetime.now(datetime.timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=datetime.timezone.utc)
    return now


def ensure_trial_subscription(db: Session, user_id: str) -> Subscription:
    """Lazily create a trial subscription row for user_id if one does not exist."""
    stmt = (
        pg_insert(Subscription)
        .values(
            user_id=user_id,
            plan_id="trial",
            status="trialing",
            billing_interval=None,
        )
        .on_conflict_do_nothing(index_elements=["user_id"])
    )
    db.execute(stmt)
    db.flush()
    sub = db.scalars(select(Subscription).where(Subscription.user_id == user_id)).first()
    if sub is None:
        raise RuntimeError(f"Failed to ensure subscription for user {user_id}")
    return sub


def mark_onboarding_completed(
    db: Session,
    profile: Profile,
    now: Optional[datetime.datetime] = None,
) -> None:
    """Mark profile onboarding complete and start the trial clock idempotently.

    Sets onboarding_completed_at if null, and sets trial_ends_at = now + 3 days
    only if the user is on the trial plan and trial_ends_at is still null.
    """
    current_time = _utc_now(now)
    if profile.onboarding_completed_at is None:
        profile.onboarding_completed_at = current_time

    sub = ensure_trial_subscription(db, profile.user_id)
    if sub.plan_id == "trial" and sub.trial_ends_at is None:
        sub.trial_ends_at = current_time + datetime.timedelta(days=TRIAL_DAYS)
        sub.updated_at = current_time

    db.flush()


def compute_subscription_status(
    sub: Subscription,
    now: Optional[datetime.datetime] = None,
) -> str:
    """Compute effective account status purely from dates (never depends on cron)."""
    current_time = _utc_now(now)

    if sub.plan_id == "internal":
        return "active"

    if sub.plan_id == "trial":
        if sub.trial_ends_at is not None:
            trial_end = _utc_now(sub.trial_ends_at)
            if current_time >= trial_end:
                return "expired"
        return "trialing"

    if sub.current_period_end is not None:
        period_end = _utc_now(sub.current_period_end)
        if current_time >= period_end:
            return "expired"

    if sub.status == "canceled":
        return "canceled"

    return "active"


def apply_pending_downgrade_if_due(
    db: Session,
    sub: Subscription,
    now: Optional[datetime.datetime] = None,
) -> None:
    """Apply a scheduled downgrade once current_period_end has passed."""
    current_time = _utc_now(now)
    if (
        sub.pending_plan_id
        and sub.pending_plan_id in PLANS
        and sub.current_period_end is not None
        and current_time >= _utc_now(sub.current_period_end)
    ):
        target_plan = sub.pending_plan_id
        target_interval = sub.pending_billing_interval or "monthly"
        sub.pending_plan_id = None
        sub.pending_billing_interval = None
        set_user_plan(
            db,
            user_id=sub.user_id,
            plan_id=target_plan,
            interval=target_interval,
            now=current_time,
            provider=sub.provider or "manual",
            provider_ref=sub.provider_ref,
        )


def get_entitlements(
    db: Session,
    user_id: str,
    now: Optional[datetime.datetime] = None,
) -> Dict[str, Any]:
    """Return the user's current plan, computed status, limits, features, and usage."""
    from app.services.quota import get_user_usage_counts

    sub = ensure_trial_subscription(db, user_id)
    apply_pending_downgrade_if_due(db, sub, now=now)
    plan = get_plan(sub.plan_id) if sub.plan_id in PLANS else get_plan("trial")
    computed_status = compute_subscription_status(sub, now=now)
    counts = get_user_usage_counts(db, user_id, sub, now=now)

    return {
        "plan_id": plan.id,
        "plan_name": plan.name,
        "status": computed_status,
        "billing_interval": sub.billing_interval,
        "trial_ends_at": sub.trial_ends_at.isoformat() if sub.trial_ends_at else None,
        "current_period_start": sub.current_period_start.isoformat() if sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        "limits": {
            "linkedin_profiles": plan.linkedin_profiles,
            "scheduled_posts": plan.scheduled_posts_per_period,
            "playground_runs": plan.playground_runs_per_period,
            "playground_runs_per_day": plan.playground_runs_per_day,
            "max_post_days_per_week": plan.max_post_days_per_week,
            "daily_spend_limit_usd": plan.daily_spend_limit_usd,
        },
        "features": {
            "approval_email": plan.approval_email,
            "approval_slack": plan.approval_slack,
            "docs_token_limit": plan.docs_token_limit,
            "analytics_level": plan.analytics_level,
            "support": plan.support_label,
        },
        "usage": {
            "scheduled_used": counts["scheduled_used"],
            "scheduled_limit": plan.scheduled_posts_per_period,
            "playground_used": counts["playground_used"],
            "playground_limit": plan.playground_runs_per_period,
            "playground_today_used": counts["playground_today_used"],
            "playground_today_limit": plan.playground_runs_per_day,
            "docs_tokens_used": counts["docs_tokens_used"],
            "docs_token_limit": plan.docs_token_limit,
        },
    }


def set_user_plan(
    db: Session,
    user_id: str,
    plan_id: str,
    interval: Optional[str] = None,
    now: Optional[datetime.datetime] = None,
    provider: str = "manual",
    provider_ref: Optional[str] = None,
) -> Subscription:
    """Assign a user's plan and update period dates."""
    if plan_id not in PLANS:
        raise ValueError(f"Unknown plan '{plan_id}'. Valid plans: {', '.join(PLANS.keys())}")

    current_time = _utc_now(now)
    sub = ensure_trial_subscription(db, user_id)

    if plan_id == "internal":
        sub.plan_id = "internal"
        sub.status = "active"
        sub.billing_interval = None
        sub.trial_ends_at = None
        sub.current_period_start = current_time
        sub.current_period_end = None
    elif plan_id == "trial":
        sub.plan_id = "trial"
        sub.status = "trialing"
        sub.billing_interval = None
        sub.trial_ends_at = current_time + datetime.timedelta(days=TRIAL_DAYS)
        sub.current_period_start = None
        sub.current_period_end = None
    else:
        chosen_interval = interval or "monthly"
        if chosen_interval not in ("monthly", "annual"):
            raise ValueError("interval must be 'monthly' or 'annual'")
        days = ANNUAL_PERIOD_DAYS if chosen_interval == "annual" else MONTHLY_WINDOW_DAYS
        sub.plan_id = plan_id
        sub.status = "active"
        sub.billing_interval = chosen_interval
        sub.current_period_start = current_time
        sub.current_period_end = current_time + datetime.timedelta(days=days)

    sub.provider = provider
    sub.provider_ref = provider_ref
    sub.updated_at = current_time
    db.flush()
    return sub


def get_public_plans_payload() -> Dict[str, Any]:
    """Return public plans payload for GET /api/plans (excludes internal)."""
    items: List[Dict[str, Any]] = []
    for pid in PUBLIC_PLAN_ORDER:
        plan = PLANS[pid]
        if not plan.is_public:
            continue
        items.append(
            {
                "id": plan.id,
                "name": plan.name,
                "monthly_price_usd": plan.monthly_price_usd,
                "monthly_price_pkr_approx": usd_to_pkr_approx(plan.monthly_price_usd),
                "annual_price_usd": plan.annual_price_usd,
                "annual_price_pkr_approx": usd_to_pkr_approx(plan.annual_price_usd),
                "annual_monthly_equivalent_usd": plan.annual_monthly_equivalent_usd,
                "annual_monthly_equivalent_pkr_approx": usd_to_pkr_approx(plan.annual_monthly_equivalent_usd),
                "plan_length_days": plan.plan_length_days,
                "limits": {
                    "linkedin_profiles": plan.linkedin_profiles,
                    "scheduled_posts": plan.scheduled_posts_per_period,
                    "playground_runs": plan.playground_runs_per_period,
                    "playground_runs_per_day": plan.playground_runs_per_day,
                    "max_post_days_per_week": plan.max_post_days_per_week,
                },
                "features": {
                    "approval_email": plan.approval_email,
                    "approval_slack": plan.approval_slack,
                    "docs_token_limit": plan.docs_token_limit,
                    "analytics_level": plan.analytics_level,
                    "support": plan.support_label,
                },
            }
        )

    return {
        "currency": "USD",
        "pkr_per_usd": PKR_PER_USD,
        "annual_discount": ANNUAL_DISCOUNT,
        "plans": items,
    }
