"""Subscription trial and renewal reminder job (5d and 1d before period end, 1d before trial end)."""

import datetime
import logging
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.plans import get_plan, get_plans
from app.models.profile import Profile
from app.models.subscription import ReminderSent, Subscription
from app.services.email import send_subscription_reminder_email

logger = logging.getLogger(__name__)


def _claim_and_send(
    db: Session,
    sub: Subscription,
    reminder_type: str,
    target_dt: datetime.datetime,
) -> bool:
    target_date = target_dt.date()
    stmt = (
        pg_insert(ReminderSent)
        .values(
            user_id=sub.user_id,
            reminder_type=reminder_type,
            target_date=target_date,
        )
        .on_conflict_do_nothing(index_elements=["user_id", "reminder_type", "target_date"])
        .returning(ReminderSent.id)
    )
    claimed = db.execute(stmt).scalar_one_or_none()
    db.commit()
    if not claimed:
        return False

    user_email = db.execute(
        text('SELECT email FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
        {"uid": sub.user_id},
    ).scalar_one_or_none()
    if not user_email:
        return False

    profile = db.scalars(select(Profile).where(Profile.user_id == sub.user_id)).first()
    display_name = (profile.display_name if profile and profile.display_name else "Creator")
    plans_map = get_plans()
    plan = plans_map.get(sub.plan_id) or get_plan("trial")

    try:
        send_subscription_reminder_email(
            to_email=str(user_email),
            display_name=display_name,
            reminder_type=reminder_type,
            plan_name=plan.name,
            target_date_str=target_date.isoformat(),
        )
        return True
    except Exception as exc:
        logger.warning(f"Failed to send {reminder_type} reminder to user {sub.user_id}: {exc}")
        return False


def send_due_subscription_reminders(
    db: Session,
    now: Optional[datetime.datetime] = None,
) -> int:
    """Send 1-day trial reminders and 5-day / 1-day renewal reminders without duplicates."""
    current_utc = now or datetime.datetime.now(datetime.timezone.utc)
    if current_utc.tzinfo is None:
        current_utc = current_utc.replace(tzinfo=datetime.timezone.utc)

    sent_count = 0
    subs = db.scalars(
        select(Subscription).where(Subscription.plan_id != "internal")
    ).all()

    from app.services.account_status import is_user_active
    for sub in subs:
        if not is_user_active(db, sub.user_id):
            continue
        if sub.plan_id == "trial" and sub.trial_ends_at is not None:
            delta = sub.trial_ends_at - current_utc
            if datetime.timedelta(0) < delta <= datetime.timedelta(days=1):
                if _claim_and_send(db, sub, "trial_1d", sub.trial_ends_at):
                    sent_count += 1
        elif sub.plan_id in ("starter", "pro", "business") and sub.current_period_end is not None:
            delta = sub.current_period_end - current_utc
            if datetime.timedelta(0) < delta <= datetime.timedelta(days=1):
                if _claim_and_send(db, sub, "renewal_1d", sub.current_period_end):
                    sent_count += 1
            elif datetime.timedelta(days=1) < delta <= datetime.timedelta(days=5):
                if _claim_and_send(db, sub, "renewal_5d", sub.current_period_end):
                    sent_count += 1

    return sent_count
