import types
from unittest.mock import patch
from fastapi.testclient import TestClient

from app.core.auth import User, current_user
from app.main import app


def _make_entry(plan_id: str, monthly_cents: int, is_system: bool = False):
    return types.SimpleNamespace(
        id=plan_id,
        monthly_price_cents=monthly_cents,
        is_system=is_system,
        is_active=True,
    )


def _mock_entries():
    return {
        "trial": _make_entry("trial", 0, is_system=True),
        "starter": _make_entry("starter", 999),
        "pro": _make_entry("pro", 2499),
        "business": _make_entry("business", 5999),
    }


def test_submit_payment_blocks_downgrade_with_409():
    client = TestClient(app)
    app.dependency_overrides[current_user] = lambda: User(
        id="user-downgrade-test",
        email="downgrade@example.com",
        name="Test",
    )
    try:
        with (
            patch(
                "app.api.routes.billing.get_effective_plan",
                return_value={"plan_id": "pro", "status": "active"},
            ),
            patch("app.api.routes.billing.get_plan_entries", return_value=_mock_entries()),
        ):
            res = client.post(
                "/api/billing/payments",
                json={
                    "plan_id": "starter",
                    "billing_interval": "monthly",
                    "method": "easypaisa",
                    "transaction_id": "TX123456",
                },
            )
        assert res.status_code == 409
        body = res.json()
        detail = body.get("detail") or body.get("error") or body
        assert detail["code"] == "downgrade_not_allowed"
        assert detail["message"] == "You can only upgrade from your current plan."
    finally:
        app.dependency_overrides.clear()


def test_submit_payment_allows_expired_and_trial_and_same_or_higher():
    client = TestClient(app)
    app.dependency_overrides[current_user] = lambda: User(
        id="user-downgrade-test",
        email="downgrade@example.com",
        name="Test",
    )
    try:
        for eff_plan, eff_status, target_plan in [
            ("pro", "expired", "starter"),
            ("trial", "trialing", "starter"),
            ("pro", "active", "pro"),
            ("pro", "active", "business"),
        ]:
            with (
                patch(
                    "app.api.routes.billing.get_effective_plan",
                    return_value={"plan_id": eff_plan, "status": eff_status},
                ),
                patch("app.api.routes.billing.get_plan_entries", return_value=_mock_entries()),
            ):
                # Invalid tx id returns 400 (proves it passed the 409 downgrade check without touching DB)
                res = client.post(
                    "/api/billing/payments",
                    json={
                        "plan_id": target_plan,
                        "billing_interval": "monthly",
                        "method": "easypaisa",
                        "transaction_id": "BAD",
                    },
                )
            assert res.status_code == 400
    finally:
        app.dependency_overrides.clear()
