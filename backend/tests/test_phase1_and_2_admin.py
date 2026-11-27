"""Integration and unit tests for Super Admin Phase 1 & Phase 2."""

import datetime
from email.message import EmailMessage
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
from app.core.auth import User, current_user
from app.core.config import settings
from app.db.session import SessionLocal
from app.jobs.publish import claim_publication
from app.main import app
from app.models.admin import AdminAuditLog, DeletedAccount, EmailLog
from app.models.approval import Approval
from app.models.post import GenerationRun, Post
from app.models.profile import Profile
from app.models.publication import PostPublication
from app.models.subscription import Payment, Subscription
from app.repositories.profile import get_or_create_profile
from app.services import account_status, notifications
from app.services.approval import decide_approval
from tests.conftest import create_test_token


@pytest.fixture
def seed_admin_and_user():
    """Insert a temporary verified admin and a normal user in neon_auth.user, cleaning up after."""
    admin_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    admin_email = "ahmadimran@mbstack.net"
    user_email = f"phase2-user-{uuid.uuid4().hex[:8]}@example.com"
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
                {"id": admin_id, "name": "Test Admin", "email": admin_email},
            )

        db.execute(
            text(
                'INSERT INTO neon_auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") '
                'VALUES (:id, :name, :email, true, now(), now())'
            ),
            {"id": user_id, "name": "Phase2 User", "email": user_email},
        )
        db.commit()

    yield {
        "admin_id": admin_id,
        "admin_email": admin_email,
        "user_id": user_id,
        "user_email": user_email,
        "created_admin": existing_admin is None,
    }

    with SessionLocal() as db:
        for uid in (user_id,):
            db.query(PostPublication).filter(PostPublication.user_id == uid).delete(synchronize_session=False)
            db.query(Approval).filter(Approval.user_id == uid).delete(synchronize_session=False)
            db.query(GenerationRun).filter(GenerationRun.user_id == uid).delete(synchronize_session=False)
            db.query(Post).filter(Post.user_id == uid).delete(synchronize_session=False)
            db.query(Payment).filter(Payment.user_id == uid).delete(synchronize_session=False)
            db.query(Subscription).filter(Subscription.user_id == uid).delete(synchronize_session=False)
            db.query(Profile).filter(Profile.user_id == uid).delete(synchronize_session=False)
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.query(AdminAuditLog).filter(AdminAuditLog.target_id == uid).delete(synchronize_session=False)
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": uid})
        db.execute(text("DELETE FROM deleted_accounts WHERE lower(email) = :e"), {"e": user_email.lower()})
        db.query(AdminAuditLog).filter(AdminAuditLog.target_email == user_email).delete(synchronize_session=False)
        if existing_admin is None:
            db.execute(text('DELETE FROM neon_auth."user" WHERE id::text = :id'), {"id": admin_id})
        db.commit()


def test_render_7_templates_and_smtp_error(monkeypatch):
    for tpl, payload in [
        ("suspended", {"display_name": "Ali", "admin_message": "Hold"}),
        ("disabled", {"display_name": "Ali"}),
        ("reactivated", {"display_name": "Ali"}),
        ("account_deleted", {"display_name": "Ali"}),
        ("plan_changed", {"display_name": "Ali", "old_plan": "Starter", "new_plan": "Pro", "limits_summary": "22/mo"}),
        ("payment_approved", {"display_name": "Ali", "amount": "$19.99", "plan_name": "Pro", "billing_interval": "monthly", "paid_until": "2026-12-25", "transaction_id": "TX1"}),
        ("payment_rejected", {"display_name": "Ali", "amount": "$19.99", "transaction_id": "TX1", "reason": "Mismatch"}),
    ]:
        subject, plain, html_body = notifications.render_notification_template(tpl, payload)
        assert subject and plain and "AutoPulse" in html_body and settings.SUPPORT_EMAIL in html_body

    from app.services import email as email_svc
    monkeypatch.setattr(settings, "SMTP_HOST", None)
    msg = EmailMessage()
    msg["Subject"] = "Test"
    msg["From"] = "AutoPulse <noreply@example.com>"
    msg["To"] = "user@example.com"
    msg.set_content("Hi")
    with pytest.raises(RuntimeError, match="SMTP_HOST is not configured"):
        email_svc.send_smtp_message(msg)


def test_email_logs_sent_failed_and_idempotency(monkeypatch):
    uid = f"email-test-{uuid.uuid4()}"
    idem = f"idem-{uuid.uuid4()}"
    try:
        with SessionLocal() as db:
            with patch("app.services.email.send_smtp_message", return_value="<id-1@mbstack.net>") as mock_send:
                r1 = notifications.send_user_notification(
                    user_id=uid,
                    to_email="u@example.com",
                    notification_type="reactivated",
                    payload={"display_name": "U"},
                    idempotency_key=idem,
                    db=db,
                )
                assert r1["status"] == "queued"
                # Duplicate enqueue while queued does not create a second row
                r_dup = notifications.send_user_notification(
                    user_id=uid,
                    to_email="u@example.com",
                    notification_type="reactivated",
                    payload={"display_name": "U"},
                    idempotency_key=idem,
                    db=db,
                )
                assert r_dup["status"] == "queued"
                assert r_dup["id"] == r1["id"]

                row1 = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r1["id"])).first()
                delivered1 = notifications.deliver_email_log(db, row1)
                assert delivered1.status == "sent"
                assert delivered1.provider_message_id == "<id-1@mbstack.net>"

                r2 = notifications.send_user_notification(
                    user_id=uid,
                    to_email="u@example.com",
                    notification_type="reactivated",
                    payload={"display_name": "U"},
                    idempotency_key=idem,
                    db=db,
                )
                assert r2["status"] == "skipped"
                assert mock_send.call_count == 1

            with patch("app.services.email.send_smtp_message", side_effect=RuntimeError("550 Rejected")):
                r3 = notifications.send_user_notification(
                    user_id=uid,
                    to_email="u@example.com",
                    notification_type="suspended",
                    payload={"display_name": "U"},
                    db=db,
                )
                assert r3["status"] == "queued"
                row3 = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r3["id"])).first()
                delivered3 = notifications.deliver_email_log(db, row3)
                assert delivered3.status == "queued"  # retryable until max_attempts
                assert "550 Rejected" in (delivered3.error or "")
                assert delivered3.next_attempt_at is not None
    finally:
        with SessionLocal() as db:
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.commit()


def test_require_admin_logs_denied(client, ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)
    uid = str(uuid.uuid4())
    token = create_test_token(private_key, sub=uid, email="not-admin@example.com", name="NoAdmin")
    try:
        resp = client.get("/api/admin/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        with SessionLocal() as db:
            row = db.query(AdminAuditLog).filter(
                AdminAuditLog.action == "admin.access_denied",
                AdminAuditLog.actor_id == uid,
            ).first()
            assert row is not None
    finally:
        with SessionLocal() as db:
            db.query(AdminAuditLog).filter(AdminAuditLog.actor_id == uid).delete(synchronize_session=False)
            db.commit()


def test_phase2_users_status_workers_delete_and_resend(seed_admin_and_user, ed25519_keys, monkeypatch):
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    admin_id = seed_admin_and_user["admin_id"]
    admin_email = seed_admin_and_user["admin_email"]
    user_id = seed_admin_and_user["user_id"]
    user_email = seed_admin_and_user["user_email"]

    admin_token = create_test_token(private_key, sub=admin_id, email=admin_email, name="Admin")
    user_token = create_test_token(private_key, sub=user_id, email=user_email, name="User")

    client = TestClient(app)

    # Seed a running run, a pending approval, an approved post + pending pub, an outcome_unknown pub, and a payment
    with SessionLocal() as db:
        now = datetime.datetime.now(datetime.timezone.utc)
        post_approved = Post(
            user_id=user_id,
            run_date=now.date(),
            status="approved",
            topic_title="Topic A",
            topic_url="https://example.com/a",
            sources=[],
            caption="Caption A",
            hashtags=[],
            image_spec={},
            publish_at=now - datetime.timedelta(minutes=5),
            llm_model="gemini-3.5-flash-lite",
            prompt_version="v1",
        )
        post_unknown = Post(
            user_id=user_id,
            run_date=now.date(),
            status="failed",
            topic_title="Topic B",
            topic_url="https://example.com/b",
            sources=[],
            caption="Caption B",
            hashtags=[],
            image_spec={},
            publish_at=now - datetime.timedelta(minutes=10),
            llm_model="gemini-3.5-flash-lite",
            prompt_version="v1",
        )
        db.add_all([post_approved, post_unknown])
        db.flush()

        pub_pending = PostPublication(user_id=user_id, post_id=post_approved.id, platform="linkedin", status="pending")
        pub_unknown = PostPublication(
            user_id=user_id,
            post_id=post_unknown.id,
            platform="linkedin",
            status="failed",
            error_code="outcome_unknown",
        )
        approval = Approval(
            user_id=user_id,
            post_id=post_approved.id,
            channel="email",
            token_hash=f"hash-{uuid.uuid4().hex}",
            expires_at=now + datetime.timedelta(hours=2),
        )
        run = GenerationRun(
            user_id=user_id,
            run_date=now.date(),
            run_type="scheduled",
            usage_kind="scheduled",
            status="running",
        )
        pay = Payment(
            user_id=user_id,
            plan_id="starter",
            billing_interval="monthly",
            amount_usd_cents=999,
            amount_pkr=2798,
            method="easypaisa",
            transaction_id=f"P2{uuid.uuid4().hex[:10].upper()}",
            status="pending",
        )
        db.add_all([pub_pending, pub_unknown, approval, run, pay])
        db.commit()
        pub_pending_id = pub_pending.id
        pub_unknown_id = pub_unknown.id
        approval_id = approval.id

    # 1. List users (starts from neon_auth.user, user without profile still appears as active)
    list_res = client.get(
        f"/api/admin/users?search={user_email}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == user_id
    assert items[0]["account_status"] == "active"

    # 2. Detail view
    det_res = client.get(
        f"/api/admin/users/{user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert det_res.status_code == 200
    assert det_res.json()["summary"]["email"] == user_email

    # 3. Protected admin cannot be suspended
    prot_res = client.patch(
        f"/api/admin/users/{admin_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "suspended", "expected_status": "active", "reason": "test", "send_email": False},
    )
    assert prot_res.status_code in (400, 403)

    # 4. Suspend user (queue email, then simulate permanent failure to test failed email_status + Resend)
    susp_res = client.patch(
        f"/api/admin/users/{user_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "status": "suspended",
            "expected_status": "active",
            "reason": "Manual abuse check",
            "send_email": True,
            "admin_message": "Contact support.",
        },
    )
    assert susp_res.status_code == 200
    assert susp_res.json()["account_status"] == "suspended"
    assert susp_res.json()["email_status"] == "queued"

    with SessionLocal() as db:
        queued_log = db.query(EmailLog).filter(EmailLog.user_id == user_id, EmailLog.status == "queued").first()
        assert queued_log is not None
        from app.services.email import EmailDeliveryError
        with patch("app.services.email.send_smtp_message", side_effect=EmailDeliveryError("550 Invalid", retryable=False)):
            notifications.deliver_email_log(db, queued_log)
        assert queued_log.status == "failed"

    # 5. Concurrent expected_status mismatch returns 409
    conflict_res = client.patch(
        f"/api/admin/users/{user_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"status": "disabled", "expected_status": "active", "reason": "stale", "send_email": False},
    )
    assert conflict_res.status_code == 409

    # 6. Verify side effects: run cancelled, approval expired, post expired, outcome_unknown untouched, claim_publication & decide_approval blocked, user JWT gets 403 ACCOUNT_SUSPENDED
    with SessionLocal() as db:
        assert not claim_publication(db, pub_pending_id)
        unk = db.query(PostPublication).filter(PostPublication.id == pub_unknown_id).first()
        assert unk.error_code == "outcome_unknown"
        appr = db.query(Approval).filter(Approval.id == approval_id).first()
        assert appr.expires_at <= datetime.datetime.now(datetime.timezone.utc)
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as dec_exc:
            decide_approval(db, decision="approved", decided_via="dashboard", post_id=appr.post_id, user_id=user_id)
        assert dec_exc.value.status_code == 403
        assert dec_exc.value.detail["code"] == "account_suspended"

    me_blocked = client.get("/me", headers={"Authorization": f"Bearer {user_token}"})
    assert me_blocked.status_code == 403
    assert me_blocked.json()["error"]["code"] == "account_suspended"

    # 7. Resend failed email log (re-queues and then delivers via outbox)
    with SessionLocal() as db:
        failed_log = db.query(EmailLog).filter(EmailLog.user_id == user_id, EmailLog.status == "failed").first()
        assert failed_log is not None
        log_id = str(failed_log.id)

    resend_res = client.post(
        f"/api/admin/users/{user_id}/notifications/{log_id}/resend",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resend_res.status_code == 200
    assert resend_res.json()["status"] == "queued"

    with SessionLocal() as db:
        requeued_log = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(log_id)).first()
        with patch("app.services.email.send_smtp_message", return_value="<resend-1@mbstack.net>"):
            notifications.deliver_email_log(db, requeued_log)
        assert requeued_log.status == "sent"
        assert requeued_log.attempts == 2

    # 8. Delete user: confirm email mismatch fails, exact match succeeds, payments/email_logs/audit_logs preserved
    bad_del = client.request(
        "DELETE",
        f"/api/admin/users/{user_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"confirm_email": "wrong@example.com", "reason": "cleanup", "send_email": False},
    )
    assert bad_del.status_code == 400

    with patch.object(notifications, "send_smtp_message", return_value="<del-1@mbstack.net>"):
        del_res = client.request(
            "DELETE",
            f"/api/admin/users/{user_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"confirm_email": user_email, "reason": "cleanup", "send_email": True},
        )
    assert del_res.status_code == 200
    assert del_res.json()["deleted"] is True

    with SessionLocal() as db:
        assert db.query(Payment).filter(Payment.user_id == user_id).count() == 1
        assert db.query(EmailLog).filter(EmailLog.user_id == user_id).count() >= 1
        assert db.query(AdminAuditLog).filter(AdminAuditLog.target_id == user_id).count() >= 2
        assert db.query(DeletedAccount).filter(DeletedAccount.email == user_email.lower()).count() == 1
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as recreate_exc:
            get_or_create_profile(db, user_id=str(uuid.uuid4()), display_name="Retry", email=user_email)
        assert recreate_exc.value.status_code == 403
        assert recreate_exc.value.detail["code"] == "ACCOUNT_DELETED"

    # 9. Allow deleted email to sign up again
    resign_res = client.request(
        "DELETE",
        "/api/admin/deleted-accounts",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"email": user_email},
    )
    assert resign_res.status_code == 200
    assert resign_res.json()["removed"] is True
