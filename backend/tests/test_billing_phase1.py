"""Phase 1 tests: pricing helper, payments, atomic admin approve/reject, effective plan cache."""

import datetime
import math
import sys
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.auth import User, current_user
from app.core.plans import PKR_PER_USD, compute_plan_price
from app.db.session import SessionLocal
from app.main import app
from app.models.subscription import Payment, Subscription
from app.services.entitlements import get_effective_plan


@pytest.fixture
def test_users():
    u1 = f"test-bill-u1-{uuid.uuid4()}"
    u2 = f"test-bill-u2-{uuid.uuid4()}"
    admin = f"test-bill-admin-{uuid.uuid4()}"
    yield {"u1": u1, "u2": u2, "admin": admin}
    with SessionLocal() as db:
        db.query(Payment).filter(Payment.user_id.in_([u1, u2, admin])).delete(synchronize_session=False)
        db.query(Subscription).filter(Subscription.user_id.in_([u1, u2, admin])).delete(synchronize_session=False)
        db.commit()


def test_compute_plan_price():
    usd_cents, pkr = compute_plan_price("starter", "monthly")
    assert usd_cents == 999
    assert pkr == math.ceil(9.99 * PKR_PER_USD)

    usd_cents_ann, pkr_ann = compute_plan_price("pro", "annual")
    assert usd_cents_ann == 22788
    assert pkr_ann == math.ceil(227.88 * PKR_PER_USD)

    for bad in ("trial", "internal", "unknown"):
        with pytest.raises(ValueError):
            compute_plan_price(bad, "monthly")


def test_checkout_info_and_payment_flow(test_users):
    u1 = test_users["u1"]
    u2 = test_users["u2"]
    admin_uid = test_users["admin"]
    active_user = {"user": User(id=u1, email="user1@example.com")}

    app.dependency_overrides[current_user] = lambda: active_user["user"]
    client = TestClient(app)
    try:
        # 1. Invalid plan on checkout-info -> 400
        assert client.get("/api/billing/checkout-info?plan=trial&interval=monthly").status_code == 400
        assert client.get("/api/billing/checkout-info?plan=internal&interval=monthly").status_code == 400

        # 2. Valid checkout-info -> server prices
        info = client.get("/api/billing/checkout-info?plan=starter&interval=monthly")
        assert info.status_code == 200
        assert info.json()["amount_usd_cents"] == 999
        assert info.json()["amount_pkr"] == math.ceil(9.99 * PKR_PER_USD)

        # 3. Bad transaction ID -> 400
        bad_tx = client.post(
            "/api/billing/payments",
            json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": "!!bad"},
        )
        assert bad_tx.status_code == 400

        # 4. Valid submit with fake amount -> server ignores fake amount, trims & uppercases tx_id
        tx_code = f"TX{uuid.uuid4().hex[:10].upper()}"
        sub_res = client.post(
            "/api/billing/payments",
            json={
                "plan_id": "starter",
                "billing_interval": "monthly",
                "method": "jazzcash",
                "transaction_id": f"  {tx_code.lower()}  ",
                "amount_pkr": 1,
                "amount_usd_cents": 1,
            },
        )
        assert sub_res.status_code == 201
        pay_data = sub_res.json()
        assert pay_data["transaction_id"] == tx_code
        assert pay_data["amount_usd_cents"] == 999
        assert pay_data["status"] == "pending"
        pay_id = pay_data["id"]

        # 5. Same user submitting second pending payment -> 409
        dup_user = client.post(
            "/api/billing/payments",
            json={"plan_id": "pro", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": f"TX{uuid.uuid4().hex[:10]}"},
        )
        assert dup_user.status_code == 409

        # 6. Second user submitting same tx_id -> 409
        active_user["user"] = User(id=u2, email="user2@example.com")
        dup_tx = client.post(
            "/api/billing/payments",
            json={"plan_id": "starter", "billing_interval": "monthly", "method": "jazzcash", "transaction_id": tx_code},
        )
        assert dup_tx.status_code == 409

        # 7. Non-admin calling /api/admin/payments -> 403
        assert client.get("/api/admin/payments?status=pending").status_code == 403

        # 8. Admin approves -> subscription active, cache invalidated, second approve -> 409
        active_user["user"] = User(id=admin_uid, email="ahmadimran@mbstack.net")
        with (
            patch("app.api.routes.admin_deps.resolve_user_email_and_verified", return_value=("ahmadimran@mbstack.net", True)),
            patch("app.api.routes.admin_payments.invalidate_effective_plan_cache") as mock_inv,
        ):
            app_res = client.post(f"/api/admin/payments/{pay_id}/approve")
            assert app_res.status_code == 200
            assert app_res.json()["status"] == "approved"
            mock_inv.assert_called_once_with(u1)

            second_app = client.post(f"/api/admin/payments/{pay_id}/approve")
            assert second_app.status_code == 409
            assert second_app.json()["error"]["message"] == "already reviewed"

        # 9. Verify effective plan for u1 is now starter active
        with SessionLocal() as db:
            eff = get_effective_plan(db, u1, bypass_cache=True)
            assert eff["plan_id"] == "starter"
            assert eff["status"] == "active"

        # 10. Reject flow & resubmit same tx_id
        active_user["user"] = User(id=u2, email="user2@example.com")
        tx2 = f"REJ{uuid.uuid4().hex[:8].upper()}"
        p2 = client.post(
            "/api/billing/payments",
            json={"plan_id": "pro", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx2},
        ).json()
        active_user["user"] = User(id=admin_uid, email="ahmadimran@mbstack.net")
        with patch("app.api.routes.admin_deps.resolve_user_email_and_verified", return_value=("ahmadimran@mbstack.net", True)):
            rej = client.post(f"/api/admin/payments/{p2['id']}/reject", json={"reason": "Amount mismatch"})
            assert rej.status_code == 200
            assert rej.json()["reject_reason"] == "Amount mismatch"

        active_user["user"] = User(id=u2, email="user2@example.com")
        resub = client.post(
            "/api/billing/payments",
            json={"plan_id": "pro", "billing_interval": "monthly", "method": "easypaisa", "transaction_id": tx2},
        )
        assert resub.status_code == 201
    finally:
        app.dependency_overrides.pop(current_user, None)
