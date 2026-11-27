"""Tests for the email outbox queue, retries, atomic claims, stuck-row recovery, and fallback."""

import datetime
import uuid
from unittest.mock import patch

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin import EmailLog
from app.services import notifications
from app.services.email import EmailDeliveryError


def test_outbox_retry_backoff_and_eventual_delivery(monkeypatch):
    uid = f"outbox-retry-{uuid.uuid4()}"
    idem = f"retry-{uuid.uuid4()}"
    try:
        with SessionLocal() as db:
            res = notifications.send_user_notification(
                user_id=uid,
                to_email="retry@example.com",
                notification_type="reactivated",
                payload={"display_name": "Retry User"},
                idempotency_key=idem,
                db=db,
            )
            assert res["status"] == "queued"
            log_id = uuid.UUID(res["id"])

            # Attempt 1: transient timeout -> stays queued with next_attempt_at in future
            row = db.query(EmailLog).filter(EmailLog.id == log_id).first()
            with patch(
                "app.services.email.send_smtp_message",
                side_effect=EmailDeliveryError("SMTP handshake timed out", retryable=True, provider="smtp"),
            ):
                notifications.deliver_email_log(db, row)
            assert row.status == "queued"
            assert row.attempts == 1
            assert row.next_attempt_at is not None
            assert row.next_attempt_at > datetime.datetime.now(datetime.timezone.utc)
            assert "timed out" in (row.error or "")

            # Make due now and succeed on attempt 2 (no duplicates)
            row.next_attempt_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5)
            db.commit()

            with patch("app.services.email.send_smtp_message", return_value="<ok-retry@mbstack.net>") as mock_send:
                out = notifications.process_email_outbox(db, max_batch=100)
            db.refresh(row)
            assert row.status == "sent"
            assert row.attempts == 2
            assert row.provider_message_id == "<ok-retry@mbstack.net>"
            assert row.total_duration_ms is not None
            assert mock_send.call_count >= 1
    finally:
        with SessionLocal() as db:
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.commit()


def test_outbox_permanent_4xx_fails_immediately_and_unknown_not_retried():
    uid = f"outbox-perm-{uuid.uuid4()}"
    try:
        with SessionLocal() as db:
            # Invalid email fails immediately without calling provider
            r_bad = notifications.send_user_notification(
                user_id=uid,
                to_email="not-an-email",
                notification_type="reactivated",
                payload={"display_name": "Bad"},
                db=db,
            )
            row_bad = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r_bad["id"])).first()
            notifications.deliver_email_log(db, row_bad)
            assert row_bad.status == "failed"
            assert row_bad.attempts == 1
            assert row_bad.next_attempt_at is None

            # Unknown outcome (read timeout after send) -> status='unknown', no auto-retry
            r_unk = notifications.send_user_notification(
                user_id=uid,
                to_email="unk@example.com",
                notification_type="reactivated",
                payload={"display_name": "Unknown"},
                db=db,
            )
            row_unk = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r_unk["id"])).first()
            with patch(
                "app.services.email.send_smtp_message",
                side_effect=EmailDeliveryError(
                    "Read timed out (outcome unknown)",
                    retryable=False,
                    unknown_outcome=True,
                    provider="smtp",
                ),
            ):
                notifications.deliver_email_log(db, row_unk)
            assert row_unk.status == "unknown"
            assert row_unk.next_attempt_at is None
    finally:
        with SessionLocal() as db:
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.commit()


def test_outbox_stuck_row_recovery_and_batch_20():
    uid = f"outbox-batch-{uuid.uuid4()}"
    try:
        with SessionLocal() as db:
            # Create a row stuck in 'sending' for 10 minutes
            stuck = EmailLog(
                user_id=uid,
                to_email="stuck@example.com",
                type="reactivated",
                status="sending",
                locked_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=10),
                payload={"display_name": "Stuck"},
            )
            db.add(stuck)
            db.commit()

            reaped = notifications.reap_stuck_email_logs(db, stuck_minutes=5)
            assert reaped >= 1
            db.refresh(stuck)
            assert stuck.status == "queued"

            # Enqueue 20 emails at once and drain without loss or duplicates
            ids = []
            for i in range(20):
                res = notifications.send_user_notification(
                    user_id=uid,
                    to_email=f"u{i}@example.com",
                    notification_type="reactivated",
                    payload={"display_name": f"U{i}"},
                    idempotency_key=f"batch-{uid}-{i}",
                    db=db,
                )
                ids.append(res["id"])

            sent_targets = []

            def fake_smtp(msg):
                sent_targets.append(str(msg["To"]))
                return f"<msg-{len(sent_targets)}@mbstack.net>"

            with patch("app.services.email.send_smtp_message", side_effect=fake_smtp):
                summary = notifications.process_email_outbox(db, max_batch=100)

            assert summary["sent"] >= 21
            rows = db.query(EmailLog).filter(EmailLog.user_id == uid).all()
            assert len(rows) == 21
            assert all(r.status == "sent" for r in rows)
    finally:
        with SessionLocal() as db:
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.commit()


def test_outbox_fallback_provider_after_3_failures(monkeypatch):
    uid = f"outbox-fb-{uuid.uuid4()}"
    monkeypatch.setattr(settings, "EMAIL_API_KEY", "re_test_key")
    monkeypatch.setattr(settings, "EMAIL_PROVIDER", "auto")
    monkeypatch.setattr(settings, "SMTP_HOST", "mail.example.com")
    try:
        with SessionLocal() as db:
            res = notifications.send_user_notification(
                user_id=uid,
                to_email="fb@example.com",
                notification_type="reactivated",
                payload={"display_name": "FB"},
                db=db,
            )
            row = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(res["id"])).first()
            # Simulate 3 prior Resend failures -> attempt 4 should fall back to SMTP
            row.attempts = 3
            db.commit()

            with patch("app.services.email.send_smtp_message", return_value="<fb-smtp@mbstack.net>") as mock_smtp:
                notifications.deliver_email_log(db, row)
            assert row.status == "sent"
            assert row.provider == "smtp"
            assert mock_smtp.call_count == 1
    finally:
        with SessionLocal() as db:
            db.query(EmailLog).filter(EmailLog.user_id == uid).delete(synchronize_session=False)
            db.commit()
