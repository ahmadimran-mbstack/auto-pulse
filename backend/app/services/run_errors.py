"""Categorized error definitions and user-safe messages for post generation runs."""

import datetime
import math
from typing import Optional

ERROR_CATEGORY_PLAN_EXPIRED = "plan_expired"
ERROR_CATEGORY_RATE_LIMITED = "rate_limited"
ERROR_CATEGORY_QUOTA_REACHED = "quota_reached"
ERROR_CATEGORY_TEMPORARY_PROBLEM = "temporary_problem"

MSG_PLAN_EXPIRED = "Your plan has ended. Renew to keep generating posts."
MSG_TEMPORARY_PROBLEM = (
    "Something went wrong on our side. Your quota was not used. Try again in a minute."
)


def format_rate_limited_message(retry_after_seconds: Optional[int | str] = None) -> str:
    """Format the rate-limited message using the Retry-After value in minutes."""
    seconds = 60
    if retry_after_seconds is not None:
        try:
            seconds = max(1, int(float(str(retry_after_seconds).strip())))
        except (ValueError, TypeError):
            seconds = 60
    minutes = max(1, math.ceil(seconds / 60))
    unit = "minute" if minutes == 1 else "minutes"
    return f"You are generating too fast. Try again in {minutes} {unit}."


def format_quota_reached_message(
    scope: str = "daily",
    resets_at: Optional[datetime.datetime] = None,
) -> str:
    """Format the quota-reached message with when it resets."""
    if scope == "daily":
        return "You have used your posts for today. It resets tomorrow."
    if resets_at is not None:
        date_str = resets_at.strftime("%b %d")
        return f"You have used your posts for this month. It resets on {date_str}."
    return "You have used your posts for this month. It resets next billing period."
