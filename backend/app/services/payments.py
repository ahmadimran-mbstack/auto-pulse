"""Payment provider interface and plan upgrade/downgrade rules."""

from abc import ABC, abstractmethod
import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.plans import PLANS
from app.models.subscription import Subscription
from app.services.entitlements import (
    compute_subscription_status,
    ensure_trial_subscription,
    set_user_plan,
)

PLAN_TIER: Dict[str, int] = {
    "trial": 0,
    "starter": 1,
    "pro": 2,
    "business": 3,
    "internal": 99,
}


def apply_plan_change(
    db: Session,
    user_id: str,
    new_plan_id: str,
    interval: Optional[str] = None,
    provider: str = "manual",
    provider_ref: Optional[str] = None,
    now: Optional[datetime.datetime] = None,
) -> Subscription:
    """Apply an upgrade immediately (new period, no proration) or schedule a downgrade at current_period_end."""
    if new_plan_id not in PLANS:
        raise ValueError(f"Unknown plan '{new_plan_id}'")

    current_time = now or datetime.datetime.now(datetime.timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=datetime.timezone.utc)

    sub = ensure_trial_subscription(db, user_id)
    current_status = compute_subscription_status(sub, now=current_time)
    current_tier = PLAN_TIER.get(sub.plan_id, 0)
    target_tier = PLAN_TIER.get(new_plan_id, 0)

    is_active_paid = (
        sub.plan_id in ("starter", "pro", "business")
        and current_status == "active"
        and sub.current_period_end is not None
        and sub.current_period_end > current_time
    )

    if is_active_paid and target_tier < current_tier and new_plan_id != "trial":
        # Downgrade: keep current plan until current_period_end
        sub.pending_plan_id = new_plan_id
        sub.pending_billing_interval = interval or "monthly"
        sub.updated_at = current_time
        db.flush()
        return sub

    # Upgrade (or starting/renewing from trial/expired): immediate effect, new period, no proration
    sub.pending_plan_id = None
    sub.pending_billing_interval = None
    return set_user_plan(
        db,
        user_id=user_id,
        plan_id=new_plan_id,
        interval=interval,
        now=current_time,
        provider=provider,
        provider_ref=provider_ref,
    )


class PaymentProvider(ABC):
    """Abstract interface for future payment gateways (Easypaisa, JazzCash, etc.)."""

    @abstractmethod
    def create_checkout(
        self,
        db: Session,
        user_id: str,
        plan_id: str,
        interval: str = "monthly",
    ) -> Dict[str, Any]:
        """Initiate a checkout session and return provider-specific checkout payload."""

    @abstractmethod
    def handle_confirmation(
        self,
        db: Session,
        user_id: str,
        plan_id: str,
        interval: str = "monthly",
        provider_ref: Optional[str] = None,
        now: Optional[datetime.datetime] = None,
    ) -> Subscription:
        """Apply plan change once payment is confirmed."""


class ManualProvider(PaymentProvider):
    """Placeholder provider used until Easypaisa/JazzCash are integrated."""

    def create_checkout(
        self,
        db: Session,
        user_id: str,
        plan_id: str,
        interval: str = "monthly",
    ) -> Dict[str, Any]:
        return {
            "provider": "manual",
            "mode": "manual",
            "plan_id": plan_id,
            "interval": interval,
            "message": "Contact support to activate your plan.",
        }

    def handle_confirmation(
        self,
        db: Session,
        user_id: str,
        plan_id: str,
        interval: str = "monthly",
        provider_ref: Optional[str] = None,
        now: Optional[datetime.datetime] = None,
    ) -> Subscription:
        return apply_plan_change(
            db,
            user_id=user_id,
            new_plan_id=plan_id,
            interval=interval,
            provider="manual",
            provider_ref=provider_ref,
            now=now,
        )
