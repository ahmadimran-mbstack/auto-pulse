"""Shared schedule & approval timeline computation in UTC and user's local timezone."""

import datetime
from dataclasses import dataclass
from typing import Optional
import zoneinfo

ALLOWED_APPROVAL_LEAD_MINUTES = (60, 180, 360, 720)
DEFAULT_APPROVAL_LEAD_MINUTES = 180
DRAFT_GENERATION_BUFFER_MINUTES = 10
REMINDER_LEAD_MINUTES = 30


@dataclass(frozen=True)
class PostTimeline:
    publish_at_utc: datetime.datetime
    approval_at_utc: datetime.datetime
    draft_at_utc: datetime.datetime
    effective_approval_at_utc: datetime.datetime
    effective_draft_at_utc: datetime.datetime
    too_close: bool
    minutes_before_publish: int
    timezone: str
    timezone_offset: str
    publish_local_iso: str
    approval_local_iso: str
    draft_local_iso: str
    publish_label: str
    approval_label: str
    draft_label: str
    publish_date_str: str
    publish_time_str: str


def resolve_zoneinfo(tz_name: Optional[str]) -> tuple[datetime.tzinfo, str]:
    clean = (tz_name or "UTC").strip() or "UTC"
    try:
        return zoneinfo.ZoneInfo(clean), clean
    except Exception:
        return datetime.timezone.utc, "UTC"


def format_utc_offset(dt_local: datetime.datetime) -> str:
    offset = dt_local.utcoffset()
    if offset is None:
        return "UTC"
    total_mins = int(offset.total_seconds() // 60)
    sign = "+" if total_mins >= 0 else "-"
    abs_mins = abs(total_mins)
    hh, mm = divmod(abs_mins, 60)
    if mm == 0:
        return f"UTC{sign}{hh}"
    return f"UTC{sign}{hh:02d}:{mm:02d}"


def format_plain_local_dt(dt_local: datetime.datetime, now_local: datetime.datetime) -> str:
    today = now_local.date()
    target = dt_local.date()
    time_part = dt_local.strftime("%I:%M %p").lstrip("0")
    if target == today:
        return f"Today {time_part}"
    if target == today + datetime.timedelta(days=1):
        return f"Tomorrow {time_part}"
    return f"{dt_local.strftime('%a %d %b')}, {time_part}"


def compute_post_timeline(
    publish_at_utc: datetime.datetime,
    approval_lead_minutes: Optional[int] = DEFAULT_APPROVAL_LEAD_MINUTES,
    tz_name: Optional[str] = "UTC",
    now_utc: Optional[datetime.datetime] = None,
) -> PostTimeline:
    """Compute draft, approval request, and publish timestamps in UTC and user local time."""
    now = now_utc or datetime.datetime.now(datetime.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=datetime.timezone.utc)
    pub_utc = (
        publish_at_utc.replace(tzinfo=datetime.timezone.utc)
        if publish_at_utc.tzinfo is None
        else publish_at_utc.astimezone(datetime.timezone.utc)
    )

    lead = approval_lead_minutes if approval_lead_minutes in ALLOWED_APPROVAL_LEAD_MINUTES else DEFAULT_APPROVAL_LEAD_MINUTES
    approval_utc = pub_utc - datetime.timedelta(minutes=lead)
    draft_utc = approval_utc - datetime.timedelta(minutes=DRAFT_GENERATION_BUFFER_MINUTES)

    too_close = approval_utc <= now
    eff_approval_utc = max(now, approval_utc)
    eff_draft_utc = max(now, draft_utc)
    mins_before = max(0, int((pub_utc - now).total_seconds() // 60))

    user_tz, resolved_tz_name = resolve_zoneinfo(tz_name)
    now_local = now.astimezone(user_tz)
    pub_local = pub_utc.astimezone(user_tz)
    app_local = eff_approval_utc.astimezone(user_tz)
    dr_local = eff_draft_utc.astimezone(user_tz)

    return PostTimeline(
        publish_at_utc=pub_utc,
        approval_at_utc=approval_utc,
        draft_at_utc=draft_utc,
        effective_approval_at_utc=eff_approval_utc,
        effective_draft_at_utc=eff_draft_utc,
        too_close=too_close,
        minutes_before_publish=mins_before,
        timezone=resolved_tz_name,
        timezone_offset=format_utc_offset(pub_local),
        publish_local_iso=pub_local.isoformat(),
        approval_local_iso=app_local.isoformat(),
        draft_local_iso=dr_local.isoformat(),
        publish_label=format_plain_local_dt(pub_local, now_local),
        approval_label=format_plain_local_dt(app_local, now_local),
        draft_label=format_plain_local_dt(dr_local, now_local),
        publish_date_str=pub_local.strftime("%a, %d %b %Y"),
        publish_time_str=pub_local.strftime("%I:%M %p").lstrip("0"),
    )


def compute_next_schedule_timeline(
    profile,
    now_utc: Optional[datetime.datetime] = None,
) -> Optional[PostTimeline]:
    """Find the next scheduled publish slot for a profile and return its PostTimeline."""
    if not profile or not profile.timezone or not profile.post_time or not profile.post_days:
        return None

    now = now_utc or datetime.datetime.now(datetime.timezone.utc)
    user_tz, _ = resolve_zoneinfo(profile.timezone)
    now_local = now.astimezone(user_tz)
    lead = getattr(profile, "approval_lead_minutes", DEFAULT_APPROVAL_LEAD_MINUTES)

    for day_offset in range(9):
        candidate_date = (now_local + datetime.timedelta(days=day_offset)).date()
        if candidate_date.weekday() in profile.post_days:
            # Build naive wall-clock time in ZoneInfo so DST folds/gaps resolve cleanly
            local_pub = datetime.datetime.combine(candidate_date, profile.post_time, tzinfo=user_tz)
            pub_utc = local_pub.astimezone(datetime.timezone.utc)
            if pub_utc > now + datetime.timedelta(minutes=5):
                return compute_post_timeline(
                    publish_at_utc=pub_utc,
                    approval_lead_minutes=lead,
                    tz_name=profile.timezone,
                    now_utc=now,
                )
    return None
