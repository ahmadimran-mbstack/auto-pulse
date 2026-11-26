"""Single source of truth for AutoPulse plans, pricing, and usage limits.

Global pricing and window settings stay in code; per-plan configuration is loaded
from the database `plans` table via `get_plans()` with an in-process cache backed
by Redis key `plans_version` and automatic fallback to the seed definitions here.
"""

from dataclasses import dataclass
from decimal import Decimal, ROUND_DOWN
import logging
import math
import threading
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

PKR_PER_USD: int = 280
ANNUAL_DISCOUNT: float = 0.05

TRIAL_DAYS: int = 3
MONTHLY_WINDOW_DAYS: int = 30
ANNUAL_PERIOD_DAYS: int = 365
MAX_FAILED_RUNS_PER_DAY: int = 5

PLANS_VERSION_REDIS_KEY: str = "plans_version"
PLANS_VERSION_CHECK_INTERVAL_SECONDS: float = 2.0

# Model pricing (standard tier, USD per 1M tokens; output price includes thinking tokens)
MODEL_PRICES: Dict[str, Dict[str, float]] = {
    "gemini-3.5-flash-lite": {"input": 0.30, "output": 2.50},
    "gemini-3.1-flash-lite": {"input": 0.25, "output": 1.50},
}

# Tavily search pricing (pay-as-you-go, basic depth = 1 credit)
TAVILY_USD_PER_CREDIT: float = 0.008
TAVILY_CREDITS_PER_SEARCH: int = 1
SEARCH_CALL_COST_USD: float = TAVILY_USD_PER_CREDIT * TAVILY_CREDITS_PER_SEARCH


def compute_llm_cost_micro_usd(model_id: str, input_tokens: int, output_tokens: int) -> int:
    """Compute LLM call cost in micro-dollars (1 USD = 1,000,000 micro-USD)."""
    prices = MODEL_PRICES.get(model_id)
    if not prices:
        return 0
    return round(input_tokens * prices["input"] + output_tokens * prices["output"])


def compute_search_cost_micro_usd() -> int:
    """Compute a single search call cost in micro-dollars."""
    return round(SEARCH_CALL_COST_USD * 1_000_000)


def usd_to_pkr_approx(usd: Optional[float]) -> Optional[int]:
    """Convert a USD price to an approximate PKR integer using PKR_PER_USD."""
    if usd is None:
        return None
    return round(usd * PKR_PER_USD)


def cents_to_usd(cents: Optional[int]) -> Optional[float]:
    """Convert integer USD cents to float USD (rounded to 2 decimals) or None."""
    if cents is None:
        return None
    return round(cents / 100.0, 2)


def usd_to_cents(usd: Optional[float]) -> Optional[int]:
    """Convert float USD to integer USD cents or None."""
    if usd is None:
        return None
    return int(round(usd * 100))


def compute_annual_cents(monthly_cents: Optional[int]) -> Tuple[Optional[int], Optional[int]]:
    """Compute (annual_price_cents, annual_monthly_equivalent_cents) using Decimal ROUND_DOWN.

    Rule matching stored seed prices (9.99 -> 9.49/mo * 12 = 113.88, etc.):
    truncate monthly_cents * (1 - ANNUAL_DISCOUNT) down to whole cents for the monthly
    equivalent, then multiply by 12 so the annual total is always 12x the displayed
    monthly equivalent (also equal to cutting monthly * 12 * 0.95 down to whole cents).
    """
    if monthly_cents is None or monthly_cents <= 0:
        return None, None
    discount_factor = Decimal("1") - Decimal(str(ANNUAL_DISCOUNT))
    annual_monthly_equiv_cents = int(
        (Decimal(monthly_cents) * discount_factor).quantize(Decimal("1"), rounding=ROUND_DOWN)
    )
    annual_cents = annual_monthly_equiv_cents * 12
    return annual_cents, annual_monthly_equiv_cents


@dataclass(frozen=True)
class PlanConfig:
    id: str
    name: str
    is_public: bool
    monthly_price_usd: Optional[float]
    annual_price_usd: Optional[float]
    annual_monthly_equivalent_usd: Optional[float]
    plan_length_days: int
    linkedin_profiles: Optional[int]
    scheduled_posts_per_period: Optional[int]
    playground_runs_per_period: Optional[int]
    playground_runs_per_day: Optional[int]
    max_post_days_per_week: Optional[int]
    approval_email: bool
    approval_slack: bool
    docs_token_limit: Optional[int]
    analytics_level: str  # "none" | "basic" | "full"
    support_label: str
    daily_spend_limit_usd: Optional[float]


@dataclass(frozen=True)
class PlanEntry:
    """Full plan record holding the 18-field PlanConfig plus database metadata."""

    config: PlanConfig
    monthly_price_cents: Optional[int]
    annual_price_cents: Optional[int]
    annual_monthly_equivalent_cents: Optional[int]
    daily_spend_limit_cents: Optional[int]
    sort_order: int
    is_active: bool
    is_popular: bool
    is_system: bool
    rate_limit_tier: str
    extra_features: Tuple[str, ...]
    version: int
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


# Seed / fallback definitions (used for migration seeding and DB-unavailable fallback only)
PLANS: Dict[str, PlanConfig] = {
    "trial": PlanConfig(
        id="trial",
        name="Free trial",
        is_public=True,
        monthly_price_usd=0.0,
        annual_price_usd=None,
        annual_monthly_equivalent_usd=None,
        plan_length_days=TRIAL_DAYS,
        linkedin_profiles=1,
        scheduled_posts_per_period=3,
        playground_runs_per_period=2,
        playground_runs_per_day=2,
        max_post_days_per_week=3,
        approval_email=True,
        approval_slack=False,
        docs_token_limit=0,
        analytics_level="none",
        support_label="help docs",
        daily_spend_limit_usd=0.50,
    ),
    "starter": PlanConfig(
        id="starter",
        name="Starter",
        is_public=True,
        monthly_price_usd=9.99,
        annual_price_usd=113.88,
        annual_monthly_equivalent_usd=9.49,
        plan_length_days=MONTHLY_WINDOW_DAYS,
        linkedin_profiles=1,
        scheduled_posts_per_period=12,
        playground_runs_per_period=3,
        playground_runs_per_day=2,
        max_post_days_per_week=3,
        approval_email=True,
        approval_slack=False,
        docs_token_limit=0,
        analytics_level="basic",
        support_label="email",
        daily_spend_limit_usd=1.00,
    ),
    "pro": PlanConfig(
        id="pro",
        name="Pro",
        is_public=True,
        monthly_price_usd=19.99,
        annual_price_usd=227.88,
        annual_monthly_equivalent_usd=18.99,
        plan_length_days=MONTHLY_WINDOW_DAYS,
        linkedin_profiles=1,
        scheduled_posts_per_period=22,
        playground_runs_per_period=5,
        playground_runs_per_day=3,
        max_post_days_per_week=5,
        approval_email=True,
        approval_slack=True,
        docs_token_limit=5000,
        analytics_level="full",
        support_label="email",
        daily_spend_limit_usd=2.00,
    ),
    "business": PlanConfig(
        id="business",
        name="Business",
        is_public=True,
        monthly_price_usd=39.99,
        annual_price_usd=455.88,
        annual_monthly_equivalent_usd=37.99,
        plan_length_days=MONTHLY_WINDOW_DAYS,
        linkedin_profiles=1,
        scheduled_posts_per_period=30,  # 44 needs a second daily slot, not built yet
        playground_runs_per_period=15,
        playground_runs_per_day=5,
        max_post_days_per_week=7,
        approval_email=True,
        approval_slack=True,
        docs_token_limit=10000,
        analytics_level="full",
        support_label="email, answered first",
        daily_spend_limit_usd=4.00,
    ),
    "internal": PlanConfig(
        id="internal",
        name="Internal",
        is_public=False,
        monthly_price_usd=None,
        annual_price_usd=None,
        annual_monthly_equivalent_usd=None,
        plan_length_days=MONTHLY_WINDOW_DAYS,
        linkedin_profiles=None,
        scheduled_posts_per_period=None,
        playground_runs_per_period=None,
        playground_runs_per_day=None,
        max_post_days_per_week=None,
        approval_email=True,
        approval_slack=True,
        docs_token_limit=None,
        analytics_level="full",
        support_label="internal",
        daily_spend_limit_usd=None,
    ),
}

# Short-window burst rate limits per plan tier (bucket -> {tier: max_requests})
RATE_LIMIT_WINDOWS: Dict[str, int] = {
    "api": 60,
    "generate": 3600,
    "payment_submit": 3600,
    "public": 60,
}

PLAN_RATE_LIMITS: Dict[str, Dict[str, Optional[int]]] = {
    "api": {
        "trial": 30,
        "starter": 60,
        "pro": 120,
        "business": 240,
        "internal": 1000,
        "expired": 30,
    },
    "generate": {
        "trial": 3,
        "starter": 5,
        "pro": 10,
        "business": 20,
        "internal": 200,
        "expired": 0,
    },
    "payment_submit": {
        "trial": 5,
        "starter": 5,
        "pro": 5,
        "business": 5,
        "internal": 50,
        "expired": 5,
    },
    "public": {
        "default": 60,
    },
}


def _build_fallback_entries() -> Dict[str, PlanEntry]:
    sort_orders = {"trial": 1, "starter": 2, "pro": 3, "business": 4, "internal": 5}
    entries: Dict[str, PlanEntry] = {}
    for pid, cfg in PLANS.items():
        entries[pid] = PlanEntry(
            config=cfg,
            monthly_price_cents=usd_to_cents(cfg.monthly_price_usd),
            annual_price_cents=usd_to_cents(cfg.annual_price_usd),
            annual_monthly_equivalent_cents=usd_to_cents(cfg.annual_monthly_equivalent_usd),
            daily_spend_limit_cents=usd_to_cents(cfg.daily_spend_limit_usd),
            sort_order=sort_orders.get(pid, 99),
            is_active=True,
            is_popular=(pid == "pro"),
            is_system=(pid in ("trial", "internal")),
            rate_limit_tier=pid,
            extra_features=(),
            version=1,
            updated_at=None,
            updated_by="seed",
        )
    return entries


_FALLBACK_ENTRIES: Dict[str, PlanEntry] = _build_fallback_entries()

_cache_lock = threading.Lock()
_cached_entries: Optional[Dict[str, PlanEntry]] = None
_cached_version: Optional[str] = None
_last_version_check_mono: float = -999.0


def _get_redis_client_safe():
    try:
        from app.core.limiter import get_redis_client
        return get_redis_client()
    except Exception:
        return None


def _row_to_entry(row) -> PlanEntry:
    monthly_cents = int(row.monthly_price_cents) if row.monthly_price_cents is not None else None
    annual_cents = int(row.annual_price_cents) if row.annual_price_cents is not None else None
    equiv_cents = (
        int(row.annual_monthly_equivalent_cents)
        if row.annual_monthly_equivalent_cents is not None
        else None
    )
    spend_cents = int(row.daily_spend_limit_cents) if row.daily_spend_limit_cents is not None else None

    cfg = PlanConfig(
        id=str(row.id),
        name=str(row.name),
        is_public=bool(row.is_public),
        monthly_price_usd=cents_to_usd(monthly_cents),
        annual_price_usd=cents_to_usd(annual_cents),
        annual_monthly_equivalent_usd=cents_to_usd(equiv_cents),
        plan_length_days=int(row.plan_length_days),
        linkedin_profiles=int(row.linkedin_profiles) if row.linkedin_profiles is not None else None,
        scheduled_posts_per_period=(
            int(row.scheduled_posts_per_period) if row.scheduled_posts_per_period is not None else None
        ),
        playground_runs_per_period=(
            int(row.playground_runs_per_period) if row.playground_runs_per_period is not None else None
        ),
        playground_runs_per_day=(
            int(row.playground_runs_per_day) if row.playground_runs_per_day is not None else None
        ),
        max_post_days_per_week=(
            int(row.max_post_days_per_week) if row.max_post_days_per_week is not None else None
        ),
        approval_email=bool(row.approval_email),
        approval_slack=bool(row.approval_slack),
        docs_token_limit=int(row.docs_token_limit) if row.docs_token_limit is not None else None,
        analytics_level=str(row.analytics_level),
        support_label=str(row.support_label),
        daily_spend_limit_usd=cents_to_usd(spend_cents),
    )
    extra = tuple(str(x) for x in (row.extra_features or []))
    return PlanEntry(
        config=cfg,
        monthly_price_cents=monthly_cents,
        annual_price_cents=annual_cents,
        annual_monthly_equivalent_cents=equiv_cents,
        daily_spend_limit_cents=spend_cents,
        sort_order=int(row.sort_order),
        is_active=bool(row.is_active),
        is_popular=bool(row.is_popular),
        is_system=bool(row.is_system),
        rate_limit_tier=str(row.rate_limit_tier),
        extra_features=extra,
        version=int(row.version),
        updated_at=row.updated_at.isoformat() if getattr(row, "updated_at", None) else None,
        updated_by=row.updated_by,
    )


def _load_entries_from_db() -> Tuple[Dict[str, PlanEntry], bool]:
    """Load plans from DB; returns (entries, loaded_from_db_ok)."""
    from sqlalchemy import select
    from app.db.session import SessionLocal
    from app.models.plan import Plan

    try:
        with SessionLocal() as db:
            rows = db.scalars(select(Plan).order_by(Plan.sort_order.asc(), Plan.id.asc())).all()
        if not rows:
            logger.warning("Plans table returned 0 rows; falling back to static plans.py definitions.")
            return dict(_FALLBACK_ENTRIES), False
        return {str(r.id): _row_to_entry(r) for r in rows}, True
    except Exception as exc:
        logger.warning(f"Failed to load plans from database; falling back to plans.py: {exc}")
        return dict(_FALLBACK_ENTRIES), False


def invalidate_plans_cache() -> None:
    """Clear the local process plan cache (next call will check Redis/DB)."""
    global _cached_entries, _cached_version, _last_version_check_mono
    with _cache_lock:
        _cached_entries = None
        _cached_version = None
        _last_version_check_mono = -999.0


def bump_plans_version() -> None:
    """Bump the shared Redis `plans_version` key and clear the local process cache."""
    client = _get_redis_client_safe()
    if client is not None:
        try:
            client.incr(PLANS_VERSION_REDIS_KEY)
        except Exception as exc:
            logger.warning(f"Failed to bump Redis {PLANS_VERSION_REDIS_KEY}: {exc}")
    invalidate_plans_cache()


def get_plan_entries() -> Dict[str, PlanEntry]:
    """Return ordered map of plan_id -> PlanEntry, cached per process with 2s Redis version check."""
    global _cached_entries, _cached_version, _last_version_check_mono

    now_mono = time.monotonic()
    if (
        _cached_entries is not None
        and (now_mono - _last_version_check_mono) < PLANS_VERSION_CHECK_INTERVAL_SECONDS
    ):
        return _cached_entries

    with _cache_lock:
        now_mono = time.monotonic()
        if (
            _cached_entries is not None
            and (now_mono - _last_version_check_mono) < PLANS_VERSION_CHECK_INTERVAL_SECONDS
        ):
            return _cached_entries

        redis_version: Optional[str] = None
        client = _get_redis_client_safe()
        if client is not None:
            try:
                raw_ver = client.get(PLANS_VERSION_REDIS_KEY)
                redis_version = str(raw_ver) if raw_ver is not None else "0"
            except Exception as exc:
                logger.warning(f"Failed to read Redis {PLANS_VERSION_REDIS_KEY}: {exc}")

        _last_version_check_mono = now_mono

        if (
            _cached_entries is not None
            and redis_version is not None
            and _cached_version is not None
            and redis_version == _cached_version
        ):
            return _cached_entries

        entries, db_ok = _load_entries_from_db()
        _cached_entries = entries
        # If DB fell back to static plans, leave _cached_version=None so next check (>2s) retries DB
        _cached_version = (redis_version or "0") if db_ok else None
        return _cached_entries


def get_plans() -> Dict[str, PlanConfig]:
    """Return map of plan_id -> PlanConfig loaded from the database with caching and fallback."""
    return {pid: entry.config for pid, entry in get_plan_entries().items()}


def get_plan(plan_id: str) -> PlanConfig:
    """Return PlanConfig for plan_id, raising KeyError if unknown."""
    plans = get_plans()
    if plan_id not in plans:
        raise KeyError(f"Unknown plan_id: {plan_id}")
    return plans[plan_id]


def get_public_plan_order() -> Tuple[str, ...]:
    """Active and public plans sorted by sort_order."""
    entries = get_plan_entries().values()
    public = [e for e in entries if e.is_active and e.config.is_public]
    public.sort(key=lambda e: (e.sort_order, e.config.id))
    return tuple(e.config.id for e in public)


def get_purchasable_plan_ids() -> Tuple[str, ...]:
    """Active, public, non-system plans that have a positive monthly price."""
    entries = get_plan_entries().values()
    purchasable = [
        e
        for e in entries
        if e.is_active
        and e.config.is_public
        and not e.is_system
        and e.monthly_price_cents is not None
        and e.monthly_price_cents > 0
    ]
    purchasable.sort(key=lambda e: (e.sort_order, e.config.id))
    return tuple(e.config.id for e in purchasable)


def get_plan_rate_limit_tier(plan_id: str) -> str:
    """Return the PLAN_RATE_LIMITS tier key for plan_id (defaults to 'trial')."""
    entry = get_plan_entries().get(plan_id)
    if entry is None:
        return "trial"
    tier = entry.rate_limit_tier
    if tier in PLAN_RATE_LIMITS["api"]:
        return tier
    return "trial"


def get_plan_tier(plan_id: str) -> int:
    """Return comparable plan rank for upgrade/downgrade ordering."""
    entry = get_plan_entries().get(plan_id)
    if entry is None:
        return -1
    if plan_id == "internal" or (entry.is_system and not entry.config.is_public):
        return 9999
    if plan_id == "trial" or (entry.is_system and (entry.monthly_price_cents or 0) == 0):
        return 0
    return max(1, entry.sort_order)


def compute_plan_price(plan_id: str, interval: str) -> Tuple[int, int]:
    """Return (amount_usd_cents, amount_pkr) for a purchasable plan and interval.

    Monthly is the plan price. Annual uses the stored annual cents or derives it from
    monthly_price_cents with Decimal ROUND_DOWN. PKR is rounded up via PKR_PER_USD.
    """
    purchasable = get_purchasable_plan_ids()
    if plan_id not in purchasable:
        raise ValueError(f"Plan '{plan_id}' cannot be purchased.")
    if interval not in ("monthly", "annual"):
        raise ValueError("Billing interval must be 'monthly' or 'annual'.")

    entry = get_plan_entries()[plan_id]
    monthly_cents = int(entry.monthly_price_cents or 0)
    if interval == "monthly":
        usd_cents = monthly_cents
    else:
        if entry.annual_price_cents is not None:
            usd_cents = int(entry.annual_price_cents)
        else:
            derived_annual, _ = compute_annual_cents(monthly_cents)
            usd_cents = int(derived_annual or 0)

    amount_pkr = math.ceil((usd_cents / 100.0) * PKR_PER_USD)
    return usd_cents, amount_pkr
