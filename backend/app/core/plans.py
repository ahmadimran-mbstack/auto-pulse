"""Single source of truth for AutoPulse plans, pricing, and usage limits.

No prices, discounts, currency rates, or plan limits should live anywhere else.
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple


PKR_PER_USD: int = 280
ANNUAL_DISCOUNT: float = 0.05

TRIAL_DAYS: int = 3
MONTHLY_WINDOW_DAYS: int = 30
ANNUAL_PERIOD_DAYS: int = 365
MAX_FAILED_RUNS_PER_DAY: int = 5

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

PUBLIC_PLAN_ORDER: Tuple[str, ...] = ("trial", "starter", "pro", "business")


def get_plan(plan_id: str) -> PlanConfig:
    """Return PlanConfig for plan_id, raising KeyError if unknown."""
    if plan_id not in PLANS:
        raise KeyError(f"Unknown plan_id: {plan_id}")
    return PLANS[plan_id]
