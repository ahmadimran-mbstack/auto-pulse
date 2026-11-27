"""Comprehensive email delivery & resilience test script for AutoPulse.

Usage:
    TEST_EMAIL_GMAIL=you@gmail.com TEST_EMAIL_OTHER=you@outlook.com uv run python scripts/test_emails.py

If TEST_EMAIL_GMAIL / TEST_EMAIL_OTHER are not set, runs the resilience suite
(wrong key, timeout, bad recipient, 20-email batch) without sending live mail.
"""

import datetime
import os
import sys
import time
import uuid
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.admin import EmailLog
from app.services import email as email_service
from app.services import notifications
from app.services.email import EmailDeliveryError


ALL_EMAIL_CASES = [
    (
        "approval_request",
        {
            "display_name": "Test Creator",
            "weekday": "Friday",
            "time_str": "09:00",
            "local_deadline": "Friday 09:00 UTC",
            "topic_title": "Test Approval Topic",
            "caption": "Sample LinkedIn post caption for email verification.",
            "has_image": False,
        },
    ),
    ("slack_disconnect", {"display_name": "Test Creator", "error_reason": "token_revoked"}),
    (
        "approval_reminder",
        {
            "display_name": "Test Creator",
            "publish_date_str": "2026-12-01",
            "publish_time_str": "09:00",
            "tz_label": "UTC",
            "topic_title": "Test Reminder Topic",
            "post_id": "test-post-id",
        },
    ),
    (
        "post_skipped",
        {"display_name": "Test Creator", "publish_time_str": "09:00", "post_id": "test-post-id"},
    ),
    (
        "spend_alert",
        {"user_email": "creator@example.com", "plan_id": "pro", "spend_usd": 2.5, "limit_usd": 2.0},
    ),
    (
        "subscription_reminder",
        {
            "display_name": "Test Creator",
            "reminder_type": "trial_1d",
            "plan_name": "Free Trial",
            "target_date_str": "2026-12-01",
        },
    ),
    ("suspended", {"display_name": "Test Creator", "admin_message": "Policy check"}),
    ("reactivated", {"display_name": "Test Creator"}),
    (
        "payment_approved",
        {
            "display_name": "Test Creator",
            "plan_name": "Pro",
            "billing_interval": "monthly",
            "amount_pkr": 6997,
            "period_end": "2026-12-27",
        },
    ),
    (
        "payment_rejected",
        {
            "display_name": "Test Creator",
            "plan_name": "Pro",
            "admin_message": "Screenshot unclear",
        },
    ),
    ("payment_voided", {"display_name": "Test Creator", "plan_name": "Pro", "admin_message": "Voided"}),
    ("plan_activated", {"display_name": "Test Creator", "plan_name": "Pro", "billing_interval": "monthly"}),
    ("support_ticket_created_user", {"display_name": "Test Creator", "ticket_id": "T-100", "subject": "Help"}),
    ("support_ticket_created_admin", {"user_email": "creator@example.com", "ticket_id": "T-100", "subject": "Help"}),
    ("support_reply_user", {"display_name": "Test Creator", "ticket_id": "T-100", "subject": "Help", "message_preview": "We fixed it."}),
    ("support_reply_admin", {"user_email": "creator@example.com", "ticket_id": "T-100", "subject": "Help", "message_preview": "Thanks!"}),
    ("support_status_changed_user", {"display_name": "Test Creator", "ticket_id": "T-100", "subject": "Help", "new_status": "resolved"}),
]


def run_live_inboxes(recipients: list[str]) -> None:
    print(f"\n=== Live Inbox Send Test ({', '.join(recipients)}) ===")
    print(f"{'Type':<30} {'Recipient':<28} {'Queued(ms)':>10} {'Provider(ms)':>12} {'Status':<10} Error")
    print("-" * 110)

    uid = f"test-script-{uuid.uuid4().hex[:8]}"
    with SessionLocal() as db:
        for to_email in recipients:
            for ntype, payload in ALL_EMAIL_CASES:
                idem = f"script:{uid}:{ntype}:{to_email}"
                if ntype == "approval_request":
                    email_service.store_pending_approval_token(idem, f"tok-{uuid.uuid4().hex[:10]}")

                t0 = time.perf_counter()
                res = notifications.send_user_notification(
                    user_id=uid,
                    to_email=to_email,
                    notification_type=ntype,
                    payload=payload,
                    idempotency_key=idem,
                    db=db,
                )
                queued_ms = int((time.perf_counter() - t0) * 1000)

                row = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(res["id"])).first()
                delivered = notifications.deliver_email_log(db, row)
                prov_ms = delivered.provider_response_ms or 0
                err = (delivered.error or "")[:60]
                print(f"{ntype:<30} {to_email:<28} {queued_ms:>10} {prov_ms:>12} {delivered.status:<10} {err}")

    print("\n=== Manual Inbox Checklist ===")
    for ntype, _ in ALL_EMAIL_CASES:
        print(f"  [ ] {ntype}")
    print("  [ ] Check BOTH Primary/Inbox and Spam/Junk folders on each test inbox.")


def run_resilience_checks() -> None:
    print("\n=== Resilience Checks (No Live Spam) ===")
    uid = f"resilience-{uuid.uuid4().hex[:8]}"
    created_ids: list[uuid.UUID] = []

    with SessionLocal() as db:
        # 1. Wrong provider key (Resend 401 -> permanent failure, no crash)
        idem1 = f"wrong-key-{uuid.uuid4().hex}"
        r1 = notifications.send_user_notification(
            user_id=uid,
            to_email="badkey@example.com",
            notification_type="reactivated",
            payload={"display_name": "BadKey"},
            idempotency_key=idem1,
            db=db,
        )
        row1 = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r1["id"])).first()
        created_ids.append(row1.id)
        with (
            patch.object(settings, "EMAIL_PROVIDER", "resend"),
            patch.object(settings, "EMAIL_API_KEY", "re_invalid_key"),
            patch(
                "app.services.email.send_resend_message",
                side_effect=EmailDeliveryError("Resend API rejected message (HTTP 401)", retryable=False, status_code=401, provider="resend"),
            ),
        ):
            d1 = notifications.deliver_email_log(db, row1)
        assert d1.status == "failed" and d1.attempts == 1
        print("[PASS] Wrong provider key: failed loudly without crashing")

        # 2. Provider timeout -> retries up to max_attempts=4, ends as failed
        idem2 = f"timeout-{uuid.uuid4().hex}"
        r2 = notifications.send_user_notification(
            user_id=uid,
            to_email="timeout@example.com",
            notification_type="reactivated",
            payload={"display_name": "Timeout"},
            idempotency_key=idem2,
            db=db,
        )
        row2 = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r2["id"])).first()
        created_ids.append(row2.id)
        with patch(
            "app.services.email.send_smtp_message",
            side_effect=EmailDeliveryError("SMTP handshake timed out", retryable=True, provider="smtp"),
        ):
            for _ in range(4):
                row2.next_attempt_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)
                db.commit()
                notifications.deliver_email_log(db, row2)
                db.refresh(row2)
        assert row2.status == "failed" and row2.attempts == 4
        print("[PASS] Provider timeout: retried 3 times (4 attempts) and marked failed")

        # 3. Bad recipient address -> immediate permanent failure, 1 attempt
        idem3 = f"bad-addr-{uuid.uuid4().hex}"
        r3 = notifications.send_user_notification(
            user_id=uid,
            to_email="not-an-email",
            notification_type="reactivated",
            payload={"display_name": "BadAddr"},
            idempotency_key=idem3,
            db=db,
        )
        row3 = db.query(EmailLog).filter(EmailLog.id == uuid.UUID(r3["id"])).first()
        created_ids.append(row3.id)
        d3 = notifications.deliver_email_log(db, row3)
        assert d3.status == "failed" and d3.attempts == 1
        print("[PASS] Bad recipient address: immediately marked failed without retry")

        # 4. 20 emails at once -> none lost, none duplicated
        sent_to: list[str] = []

        def fake_send(msg, **kwargs):
            sent_to.append(str(msg["To"]))
            return f"mock-{len(sent_to)}", "smtp", 12

        batch_ids: list[uuid.UUID] = []
        for i in range(20):
            rb = notifications.send_user_notification(
                user_id=uid,
                to_email=f"batch{i}@example.com",
                notification_type="reactivated",
                payload={"display_name": f"B{i}"},
                idempotency_key=f"batch-{uid}-{i}",
                db=db,
            )
            bid = uuid.UUID(rb["id"])
            brow = db.query(EmailLog).filter(EmailLog.id == bid).first()
            brow.next_attempt_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=5)
            db.commit()
            batch_ids.append(bid)
            created_ids.append(bid)

        with patch("app.services.notifications.send_email_message", side_effect=fake_send):
            for bid in batch_ids:
                brow = db.query(EmailLog).filter(EmailLog.id == bid).first()
                notifications.deliver_email_log(db, brow)

        assert len(sent_to) == 20 and len(set(sent_to)) == 20
        print("[PASS] 20-email batch: all 20 delivered, 0 lost, 0 duplicated")

        # Clean up test rows
        db.query(EmailLog).filter(EmailLog.id.in_(created_ids)).delete(synchronize_session=False)
        db.commit()


if __name__ == "__main__":
    recipients = [
        v.strip()
        for v in (
            os.environ.get("TEST_EMAIL_GMAIL", ""),
            os.environ.get("TEST_EMAIL_OTHER", ""),
            os.environ.get("TEST_EMAIL_TO", ""),
        )
        if v and v.strip()
    ]
    if recipients:
        run_live_inboxes(recipients)
    else:
        print("No TEST_EMAIL_GMAIL / TEST_EMAIL_OTHER env vars set; skipping live inbox sends.")
    run_resilience_checks()
