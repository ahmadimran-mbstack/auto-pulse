"""Integration tests for Phase 3 Admin Payments audit, emails, idempotency, and filtering."""

import sys
from pathlib import Path
from unittest.mock import patch
import uuid

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core import auth
from app.db.session import SessionLocal
from app.main import app
from app.models.admin import AdminAuditLog, EmailLog
from app.models.subscription import Payment, Subscription
from app.services import notifications
from tests.conftest import create_test_token


@pytest.fixture
def seed_payment_users():
    admin_id = str(uuid.uuid4())
    u1_id = str(uuid.uuid4())
    u2_id = str(uuid.uuid4())
    admin_email = "ahmadimran@mbstack.net"
    u1_email = f"pay-u1-{uuid.uuid4().hex[:8]}@example.com"
    u2_email = f"pay-u2-{uuid.uuid4().hex[:8]}@example.com"
    existing_admin = None

    with SessionLocal() as db:
        existing_admin = db.execute(
            text('SELECT id::text, "emailVerified" FROM neon_auth."user" WHERE lower(email) = :e LIMIT 1'),
            {"e": admin_email},
        ).fetchone()
        if existing_admin:
            admin_id = existing_admin.id
            if not existing_admin.emailVerified:
                db.execute(
                    text('UPDATE neon_auth."user" SET "emailVerified" = true WHERE id::text = :id'),
                    {"id": admin_id},
                )
        else:
            db.execute(
                text(
                    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                    'VALUES (:id, :name, :email, true, now(), now())'
                ),
                {"id": admin_id, "name": "Pay Admin", "email": admin_email},
            )

        for uid, email, name in ((u1_id, u1_email, "Pay U1"), (u2_id, u2_email, "Pay U2")):
            db.execute(
                text(
                    'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                    'VALUES (:id, :name, :email, true, now(), now())'
                ),
                {"id": uid, "name": name, "email": email},
            )
        db.commit()

    yield {
        "admin_id": admin_id,
        "admin_email": admin_email,
        "u1_id": u1_id,
        "u1_email": u1_email,
        "u2_id": u2_id,
        "u2_email": u2_email,
    }

    with SessionLocal() as db:
        for uid in (u1_id, u2_id):
            db.query(Payment).filter(Payment.user_id == uid).delete(synchronize_session=False)
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": uid})
        db.query(AdminAuditLog).filter(AdminAuditLog.target_email.in_([u1_email, u2_email])).delete(
            synchronize_session=False
        )
        if existing_admin is None:
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": admin_id})
        db.commit()


def test_phase3_payments_list_approve_reject_audit_and_emails(seed_payment_users, ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_token = create_test_token(
        private_key,
        sub=seed_payment_users["admin_id"],
        email=seed_payment_users["admin_email"],
        name="Admin",
    )
    u1_id = seed_payment_users["u1_id"]
    u2_id = seed_payment_users["u2_id"]
    tx1 = f"EP{uuid.uuid4().hex[:10].upper()}"
    tx2 = f"JC{uuid.uuid4().hex[:10].upper()}"

    with SessionLocal() as db:
        p1 = Payment(
            user_id=u1_id,
            user_email=seed_payment_users["u1_email"],
            plan_id="pro",
            billing_interval="monthly",
            amount_usd_cents=1999,
            amount_pkr=5598,
            method="easypaisa",
            transaction_id=tx1,
            status="pending",
        )
        p2 = Payment(
            user_id=u2_id,
            user_email=seed_payment_users["u2_email"],
            plan_id="starter",
            billing_interval="annual",
            amount_usd_cents=11388,
            amount_pkr=31887,
            method="jazzcash",
            transaction_id=tx2,
            status="pending",
        )
        db.add_all([p1, p2])
        db.commit()
        p1_id = str(p1.id)
        p2_id = str(p2.id)

    client = TestClient(app)

    # 1. Server-side search & method filter
    list_res = client.get(
        f"/api/admin/payments?status=pending&search={tx1}&method=easypaisa&plan=pro",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_res.status_code == 200
    data = list_res.json()
    assert len(data["items"]) == 1
    assert data["items"][0]["transaction_id"] == tx1
    assert data["pending_count"] >= 2

    # 2. Approve p1 (queues email immediately, then delivers via outbox)
    app_res = client.post(
        f"/api/admin/payments/{p1_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "approved"
    assert app_res.json()["email_status"] == "queued"

    # Concurrent second approve -> 409
    app_again = client.post(
        f"/api/admin/payments/{p1_id}/approve",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert app_again.status_code == 409

    # 3. Reject p2 -> rejection still succeeds with email_status='queued', even if SMTP fails later
    rej_res = client.post(
        f"/api/admin/payments/{p2_id}/reject",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"reason": "Transaction ID not found in JazzCash"},
    )
    assert rej_res.status_code == 200
    assert rej_res.json()["status"] == "rejected"
    assert rej_res.json()["email_status"] == "queued"

    # 4. Verify audit logs and deliver queued emails via outbox (p1 succeeds, p2 permanent fail)
    from app.models.admin import EmailLog
    from app.services.email import EmailDeliveryError
    with SessionLocal() as db:
        a1 = db.query(AdminAuditLog).filter(AdminAuditLog.target_id == p1_id, AdminAuditLog.action == "payment.approved").first()
        a2 = db.query(AdminAuditLog).filter(AdminAuditLog.target_id == p2_id, AdminAuditLog.action == "payment.rejected").first()
        assert a1 is not None and a1.email_status == "queued"
        assert a2 is not None and a2.email_status == "queued"

        e1 = db.query(EmailLog).filter(EmailLog.idempotency_key == f"payment_approved:{p1_id}").first()
        e2 = db.query(EmailLog).filter(EmailLog.idempotency_key == f"payment_rejected:{p2_id}").first()
        assert e1 is not None and e2 is not None
        with patch("app.services.email.send_smtp_message", return_value="<pay-ok@mbstack.net>"):
            notifications.deliver_email_log(db, e1)
        assert e1.status == "sent"
        with patch("app.services.email.send_smtp_message", side_effect=EmailDeliveryError("SMTP refused", retryable=False)):
            notifications.deliver_email_log(db, e2)
        assert e2.status == "failed"
        assert "SMTP refused" in (e2.error or "")

        e1 = db.query(EmailLog).filter(EmailLog.idempotency_key == f"payment_approved:{p1_id}").first()
        e2 = db.query(EmailLog).filter(EmailLog.idempotency_key == f"payment_rejected:{p2_id}").first()
        assert e1 is not None and e1.status == "sent"
        assert e2 is not None and e2.status == "failed"
