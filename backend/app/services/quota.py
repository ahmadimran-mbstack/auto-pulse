"""Atomic quota enforcement, spend guard, and feature gate helpers."""

import datetime
import logging
from typing import Any, Dict, Optional, Tuple
import uuid
import zoneinfo

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.plans import (
    MAX_FAILED_RUNS_PER_DAY,
    MONTHLY_WINDOW_DAYS,
    PLANS,
    get_plan,
)
from app.db.session import SessionLocal
from app.models.customization import CustomizationDocument
from app.models.post import GenerationRun, PlaygroundRun
from app.models.profile import Profile
from app.models.subscription import Subscription
from app.models.usage import LLMCallLog, SpendAlert
from app.services.email import send_spend_alert_email
from app.services.entitlements import compute_subscription_status, ensure_trial_subscription
from app.services.usage_logger import get_usage_context

logger = logging.getLogger(__name__)

# Statuses that count against monthly/daily run quotas (in-flight + usable draft outcomes)
COUNTED_RUN_STATUSES = ("queued", "started", "running", "succeeded", "needs_review")
FAILED_BACKSTOP_STATUSES = ("failed_error", "cancelled")


class RunBudgetExceeded(Exception):
    """Raised when an in-flight run hits MAX_LLM_CALLS_PER_RUN or daily_spend_limit."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


def _utc_now(now: Optional[datetime.datetime] = None) -> datetime.datetime:
    if now is None:
        return datetime.datetime.now(datetime.timezone.utc)
    if now.tzinfo is None:
        return now.replace(tzinfo=datetime.timezone.utc)
    return now


def _next_upgrade_plan(plan_id: str) -> Optional[str]:
    order = {"trial": "starter", "starter": "pro", "pro": "business", "business": None, "internal": None}
    return order.get(plan_id, "starter")


def get_user_local_day_bounds(
    db: Session,
    user_id: str,
    now: Optional[datetime.datetime] = None,
) -> Tuple[datetime.date, datetime.datetime, datetime.datetime]:
    """Return (local_date, day_start_utc, day_end_utc) using the user's profile.timezone."""
    current_utc = _utc_now(now)
    tz_name = db.scalars(select(Profile.timezone).where(Profile.user_id == user_id)).first() or "UTC"
    try:
        user_tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        user_tz = datetime.timezone.utc

    local_now = current_utc.astimezone(user_tz)
    local_date = local_now.date()
    day_start_local = datetime.datetime.combine(local_date, datetime.time.min, tzinfo=user_tz)
    day_end_local = day_start_local + datetime.timedelta(days=1)
    return (
        local_date,
        day_start_local.astimezone(datetime.timezone.utc),
        day_end_local.astimezone(datetime.timezone.utc),
    )


def get_billing_window(
    sub: Subscription,
    now: Optional[datetime.datetime] = None,
) -> Tuple[Optional[datetime.datetime], Optional[datetime.datetime]]:
    """Return (window_start_utc, window_end_utc) for 30-day rolling windows from period start."""
    if sub.plan_id in ("internal", "trial") or not sub.current_period_start:
        return None, None

    current_utc = _utc_now(now)
    period_start = _utc_now(sub.current_period_start)
    window_secs = MONTHLY_WINDOW_DAYS * 86400
    elapsed = max(0.0, (current_utc - period_start).total_seconds())
    window_idx = int(elapsed // window_secs)
    win_start = period_start + datetime.timedelta(days=MONTHLY_WINDOW_DAYS * window_idx)
    win_end = win_start + datetime.timedelta(days=MONTHLY_WINDOW_DAYS)
    return win_start, win_end


def get_docs_tokens_used(db: Session, user_id: str) -> int:
    """Sum token_estimate across all uploaded/pasted customization documents for user_id."""
    total = db.scalar(
        select(func.coalesce(func.sum(CustomizationDocument.token_estimate), 0)).where(
            CustomizationDocument.user_id == user_id,
            CustomizationDocument.status != "deleted",
        )
    )
    return int(total or 0)


def get_user_usage_counts(
    db: Session,
    user_id: str,
    sub: Subscription,
    now: Optional[datetime.datetime] = None,
) -> Dict[str, int]:
    """Compute current window & daily usage counts from generation_runs and customization_documents."""
    _, day_start_utc, day_end_utc = get_user_local_day_bounds(db, user_id, now=now)
    win_start, win_end = get_billing_window(sub, now=now)

    def _count_runs(kind: str, start_utc: Optional[datetime.datetime], end_utc: Optional[datetime.datetime]) -> int:
        stmt = select(func.count(GenerationRun.id)).where(
            GenerationRun.user_id == user_id,
            GenerationRun.usage_kind == kind,
            GenerationRun.status.in_(COUNTED_RUN_STATUSES),
        )
        if start_utc is not None and end_utc is not None:
            stmt = stmt.where(GenerationRun.started_at >= start_utc, GenerationRun.started_at < end_utc)
        return int(db.scalar(stmt) or 0)

    return {
        "scheduled_used": _count_runs("scheduled", win_start, win_end),
        "playground_used": _count_runs("playground", win_start, win_end),
        "playground_today_used": _count_runs("playground", day_start_utc, day_end_utc),
        "docs_tokens_used": get_docs_tokens_used(db, user_id),
    }


def _block_detail(
    code: str,
    message: str,
    upgrade_to: Optional[str],
    error_category: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "code": code,
        "error_category": error_category or code,
        "message": message,
        "upgrade_to": upgrade_to,
    }


def raise_blocked_403(code: str, message: str, upgrade_to: Optional[str] = None) -> None:
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=_block_detail(code, message, upgrade_to),
    )


def check_and_reserve_run(
    db: Session,
    user_id: str,
    usage_kind: str,
    run_id: uuid.UUID,
    run_type: str,
    run_date: datetime.date,
    boot_id: Optional[str] = None,
    create_playground_row: bool = False,
    initial_status: str = "queued",
    search_provider: Optional[str] = None,
    now: Optional[datetime.datetime] = None,
) -> Tuple[Optional[GenerationRun], Optional[Dict[str, Any]]]:
    """Atomically lock the user's subscription row, check all quotas/limits, and insert generation_runs.

    Returns (GenerationRun, None) on success, or (None, error_detail) if blocked.
    """
    current_utc = _utc_now(now)
    ensure_trial_subscription(db, user_id)

    # Lock the user's subscription row for the duration of this transaction
    sub = db.scalars(
        select(Subscription).where(Subscription.user_id == user_id).with_for_update()
    ).first()
    if sub is None:
        return None, _block_detail("trial_expired", "Subscription record missing.", "starter")

    from app.services.entitlements import get_effective_plan

    eff = get_effective_plan(db, user_id, now=current_utc, bypass_cache=(now is not None))
    plan = eff["plan"]
    computed_status = eff["status"]

    if computed_status == "expired":
        from app.services.run_errors import ERROR_CATEGORY_PLAN_EXPIRED, MSG_PLAN_EXPIRED

        code = "trial_expired" if plan.id == "trial" else "subscription_expired"
        return None, _block_detail(
            code,
            MSG_PLAN_EXPIRED,
            "starter" if plan.id == "trial" else plan.id,
            error_category=ERROR_CATEGORY_PLAN_EXPIRED,
        )

    local_date, day_start_utc, day_end_utc = get_user_local_day_bounds(db, user_id, now=current_utc)

    if plan.id != "internal":
        from app.services.run_errors import ERROR_CATEGORY_QUOTA_REACHED, format_quota_reached_message

        # 1. Failed run backstop (exclude temporary_problem so transient errors never lock out users)
        failed_today = int(
            db.scalar(
                select(func.count(GenerationRun.id)).where(
                    GenerationRun.user_id == user_id,
                    GenerationRun.status.in_(FAILED_BACKSTOP_STATUSES),
                    (GenerationRun.error_category.is_(None))
                    | (GenerationRun.error_category != "temporary_problem"),
                    GenerationRun.started_at >= day_start_utc,
                    GenerationRun.started_at < day_end_utc,
                )
            )
            or 0
        )
        if failed_today >= MAX_FAILED_RUNS_PER_DAY:
            return None, _block_detail(
                "failed_run_backstop",
                format_quota_reached_message("daily"),
                None,
                error_category=ERROR_CATEGORY_QUOTA_REACHED,
            )

        # 2. Daily spend limit
        if plan.daily_spend_limit_usd is not None:
            spend_micro = int(
                db.scalar(
                    select(func.coalesce(func.sum(LLMCallLog.cost_micro_usd), 0)).where(
                        LLMCallLog.user_id == user_id,
                        LLMCallLog.created_at >= day_start_utc,
                        LLMCallLog.created_at < day_end_utc,
                    )
                )
                or 0
            )
            limit_micro = round(plan.daily_spend_limit_usd * 1_000_000)
            if spend_micro >= limit_micro:
                return None, _block_detail(
                    "daily_spend_limit",
                    format_quota_reached_message("daily"),
                    _next_upgrade_plan(plan.id),
                    error_category=ERROR_CATEGORY_QUOTA_REACHED,
                )

        # 3. Monthly / total period cap
        win_start, win_end = get_billing_window(sub, now=current_utc)
        period_limit = (
            plan.scheduled_posts_per_period if usage_kind == "scheduled" else plan.playground_runs_per_period
        )
        if period_limit is not None:
            period_stmt = select(func.count(GenerationRun.id)).where(
                GenerationRun.user_id == user_id,
                GenerationRun.usage_kind == usage_kind,
                GenerationRun.status.in_(COUNTED_RUN_STATUSES),
            )
            if win_start is not None and win_end is not None:
                period_stmt = period_stmt.where(
                    GenerationRun.started_at >= win_start,
                    GenerationRun.started_at < win_end,
                )
            period_used = int(db.scalar(period_stmt) or 0)
            if period_used >= period_limit:
                return None, _block_detail(
                    "monthly_quota_reached",
                    format_quota_reached_message("monthly", resets_at=win_end),
                    _next_upgrade_plan(plan.id),
                    error_category=ERROR_CATEGORY_QUOTA_REACHED,
                )

        # 4. Daily cap
        if usage_kind == "playground" and plan.playground_runs_per_day is not None:
            daily_used = int(
                db.scalar(
                    select(func.count(GenerationRun.id)).where(
                        GenerationRun.user_id == user_id,
                        GenerationRun.usage_kind == "playground",
                        GenerationRun.status.in_(COUNTED_RUN_STATUSES),
                        GenerationRun.started_at >= day_start_utc,
                        GenerationRun.started_at < day_end_utc,
                    )
                )
                or 0
            )
            if daily_used >= plan.playground_runs_per_day:
                return None, _block_detail(
                    "daily_limit_reached",
                    format_quota_reached_message("daily"),
                    _next_upgrade_plan(plan.id),
                    error_category=ERROR_CATEGORY_QUOTA_REACHED,
                )
        elif usage_kind == "scheduled":
            sched_today = int(
                db.scalar(
                    select(func.count(GenerationRun.id)).where(
                        GenerationRun.user_id == user_id,
                        GenerationRun.usage_kind == "scheduled",
                        GenerationRun.run_date == run_date,
                        GenerationRun.status.in_(COUNTED_RUN_STATUSES),
                    )
                )
                or 0
            )
            if sched_today >= 1:
                return None, _block_detail(
                    "daily_limit_reached",
                    format_quota_reached_message("daily"),
                    _next_upgrade_plan(plan.id),
                    error_category=ERROR_CATEGORY_QUOTA_REACHED,
                )

    # All checks passed: insert GenerationRun (and PlaygroundRun if needed) in the same transaction
    gen_run = GenerationRun(
        id=run_id,
        user_id=user_id,
        run_date=run_date,
        run_type=run_type,
        usage_kind=usage_kind,
        status=initial_status,
        current_step=initial_status,
        current_node=initial_status,
        boot_id=boot_id or settings.BOOT_ID,
        started_at=current_utc,
        last_progress_at=current_utc,
        round=0,
        search_provider=search_provider or settings.SEARCH_PROVIDER,
    )
    db.add(gen_run)

    if create_playground_row:
        p_run = PlaygroundRun(
            id=run_id,
            user_id=user_id,
            status=initial_status,
            current_step=initial_status,
            current_node=initial_status,
            boot_id=boot_id or settings.BOOT_ID,
            started_at=current_utc,
            last_progress_at=current_utc,
            round=0,
        )
        db.add(p_run)

    db.flush()
    return gen_run, None


def _send_daily_spend_alert_once(db: Session, user_id: str, local_date: datetime.date, plan_id: str, spend_micro: int, limit_usd: float) -> None:
    """Insert into spend_alerts (user_id, day) and send OPS_ALERT_EMAIL at most once per user per day."""
    stmt = (
        pg_insert(SpendAlert)
        .values(user_id=user_id, day=local_date)
        .on_conflict_do_nothing(index_elements=["user_id", "day"])
        .returning(SpendAlert.id)
    )
    inserted_id = db.execute(stmt).scalar_one_or_none()
    db.commit()
    if inserted_id is None:
        return

    ops_email = getattr(settings, "OPS_ALERT_EMAIL", None)
    if not ops_email:
        logger.warning(f"Daily spend limit hit for user {user_id} (${spend_micro/1_000_000:.4f}/${limit_usd:.2f}), OPS_ALERT_EMAIL not configured")
        return

    user_email = db.execute(
        text('SELECT email FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": user_id},
    ).scalar_one_or_none() or user_id

    try:
        send_spend_alert_email(
            to_email=ops_email,
            user_email=str(user_email),
            plan_id=plan_id,
            spend_usd=spend_micro / 1_000_000.0,
            limit_usd=limit_usd,
        )
    except Exception as exc:
        logger.warning(f"Failed to send OPS_ALERT_EMAIL for user {user_id}: {exc}")


def check_run_budgets_before_call(is_llm: bool = True) -> None:
    """Enforce MAX_LLM_CALLS_PER_RUN and plan daily_spend_limit_usd before each real call."""
    ctx = get_usage_context()
    if not ctx:
        return

    run_id = ctx.get("run_id")
    user_id = str(ctx["user_id"])

    with SessionLocal() as db:
        if is_llm and run_id is not None:
            is_search = LLMCallLog.model.like("tavily%") | LLMCallLog.model.like("exa%")
            llm_count = int(
                db.scalar(
                    select(func.count(LLMCallLog.id)).where(
                        LLMCallLog.run_id == run_id,
                        ~is_search,
                    )
                )
                or 0
            )
            if llm_count >= settings.MAX_LLM_CALLS_PER_RUN:
                raise RunBudgetExceeded("max_llm_calls")

        sub = db.scalars(select(Subscription).where(Subscription.user_id == user_id)).first()
        if not sub or sub.plan_id == "internal":
            return
        plan = get_plan(sub.plan_id) if sub.plan_id in PLANS else get_plan("trial")
        if plan.daily_spend_limit_usd is None:
            return

        local_date, day_start_utc, day_end_utc = get_user_local_day_bounds(db, user_id)
        spend_micro = int(
            db.scalar(
                select(func.coalesce(func.sum(LLMCallLog.cost_micro_usd), 0)).where(
                    LLMCallLog.user_id == user_id,
                    LLMCallLog.created_at >= day_start_utc,
                    LLMCallLog.created_at < day_end_utc,
                )
            )
            or 0
        )
        limit_micro = round(plan.daily_spend_limit_usd * 1_000_000)
        if spend_micro >= limit_micro:
            _send_daily_spend_alert_once(db, user_id, local_date, plan.id, spend_micro, plan.daily_spend_limit_usd)
            raise RunBudgetExceeded("daily_spend_limit")
