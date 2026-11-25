"""Send all 7 transactional admin notification templates to one test email address.

Usage:
    cd backend
    ..\\venv\\Scripts\\python.exe -m scripts.send_test_emails you@example.com
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.notifications import send_user_notification


SAMPLE_TEMPLATES = [
    (
        "suspended",
        {
            "display_name": "Test User",
            "admin_message": "Your account was paused due to suspicious activity.",
        },
    ),
    (
        "disabled",
        {
            "display_name": "Test User",
            "admin_message": "Your account was disabled per your request.",
        },
    ),
    (
        "reactivated",
        {
            "display_name": "Test User",
        },
    ),
    (
        "account_deleted",
        {
            "display_name": "Test User",
            "admin_message": "Deleted by admin at user request.",
        },
    ),
    (
        "plan_changed",
        {
            "display_name": "Test User",
            "old_plan": "Starter",
            "new_plan": "Pro",
            "limits_summary": "22 scheduled posts / month, 5 playground runs / month, Slack approvals enabled",
            "admin_message": "Upgraded as a courtesy.",
        },
    ),
    (
        "payment_approved",
        {
            "display_name": "Test User",
            "amount": "$19.99 (Rs 5,598)",
            "plan_name": "Pro",
            "billing_interval": "monthly",
            "paid_until": "2026-12-25 12:00 UTC",
            "transaction_id": "TXN123456789",
        },
    ),
    (
        "payment_rejected",
        {
            "display_name": "Test User",
            "amount": "$19.99 (Rs 5,598)",
            "transaction_id": "TXN987654321",
            "reason": "Transaction ID could not be matched in Easypaisa statement.",
        },
    ),
]


def main() -> int:
    if len(sys.argv) < 2 or "@" not in sys.argv[1]:
        print("Usage: python -m scripts.send_test_emails <recipient-email>", file=sys.stderr)
        return 1

    to_email = sys.argv[1].strip()
    print(f"Sending {len(SAMPLE_TEMPLATES)} test emails to {to_email}...\n")

    failures = 0
    for idx, (tpl_type, payload) in enumerate(SAMPLE_TEMPLATES, start=1):
        result = send_user_notification(
            user_id=None,
            to_email=to_email,
            notification_type=tpl_type,
            payload=payload,
            idempotency_key=None,
        )
        status_str = result["status"]
        msg_id = result.get("provider_message_id") or "-"
        err = result.get("error") or ""
        print(f"[{idx}/{len(SAMPLE_TEMPLATES)}] {tpl_type:18s} status={status_str} message_id={msg_id}")
        if err:
            print(f"    error: {err}")
        if status_str != "sent":
            failures += 1

    print(f"\nDone. Sent: {len(SAMPLE_TEMPLATES) - failures}/{len(SAMPLE_TEMPLATES)}, Failed: {failures}")
    return 0 if failures == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
