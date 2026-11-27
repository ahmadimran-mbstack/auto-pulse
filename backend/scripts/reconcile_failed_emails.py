"""Safe one-time script to reconcile existing failed email_logs rows.

Checks the current database state of each related record before re-queueing:
- Re-queues only emails whose underlying state is still true and not superseded by a later sent email.
- Marks stale/superseded emails as 'skipped' with an explicit reason (never deletes rows).

Usage:
    cd backend
    ..\\venv\\Scripts\\python.exe -m scripts.reconcile_failed_emails --dry-run
    ..\\venv\\Scripts\\python.exe -m scripts.reconcile_failed_emails --apply
"""

import argparse
import datetime
import sys
from pathlib import Path
from typing import Optional, Tuple

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.db.session import SessionLocal
from app.services.notifications import process_email_outbox


def _check_email_validity(db, row) -> Tuple[str, str]:
    """Return ('requeue' | 'skip', reason)."""
    etype = row.type
    user_id = row.user_id
    to_email = row.to_email
    idem = row.idempotency_key or ""
    payload = row.payload or {}

    # 1. Check if a newer 'sent' row already exists for the same idempotency_key or (to_email, type)
    later_sent = db.execute(
        text(
            """
            SELECT id FROM email_logs
            WHERE status = 'sent'
              AND created_at > :created_at
              AND (
                  (:idem <> '' AND idempotency_key = :idem)
                  OR (to_email = :to_email AND type = :etype)
              )
            LIMIT 1
            """
        ),
        {"created_at": row.created_at, "idem": idem, "to_email": to_email, "etype": etype},
    ).fetchone()
    if later_sent:
        return "skip", f"Superseded by later sent email ({later_sent.id})"

    # 2. Payment emails
    if etype in ("payment_approved", "payment_rejected"):
        payment_id = idem.split(":", 1)[1] if ":" in idem else None
        if payment_id:
            p = db.execute(
                text("SELECT status FROM payments WHERE id::text = :pid LIMIT 1"),
                {"pid": payment_id},
            ).fetchone()
            if not p:
                return "skip", f"Payment record {payment_id} no longer exists"
            expected = "approved" if etype == "payment_approved" else "rejected"
            if p.status != expected:
                return "skip", f"Stale: payment status is now '{p.status}' (expected '{expected}')"
            return "requeue", f"Payment {payment_id} is still '{expected}'"

    # 3. Account status emails
    if etype in ("suspended", "disabled", "reactivated"):
        if not user_id:
            return "skip", "Missing user_id for status email"
        u = db.execute(
            text('SELECT id FROM neon_auth."user" WHERE id::text = :uid LIMIT 1'),
            {"uid": user_id},
        ).fetchone()
        if not u:
            return "skip", "User account no longer exists"
        prof = db.execute(
            text("SELECT account_status FROM profiles WHERE user_id = :uid LIMIT 1"),
            {"uid": user_id},
        ).fetchone()
        curr_status = prof.account_status if prof else "active"
        expected = "active" if etype == "reactivated" else etype
        if curr_status != expected:
            return "skip", f"Stale: account_status is now '{curr_status}' (expected '{expected}')"
        return "requeue", f"Account status is still '{expected}'"

    # 4. Plan changed emails
    if etype == "plan_changed":
        if not user_id:
            return "skip", "Missing user_id for plan_changed email"
        sub = db.execute(
            text(
                """
                SELECT s.plan_id, p.name AS plan_name
                FROM subscriptions s
                LEFT JOIN plans p ON p.id = s.plan_id
                WHERE s.user_id = :uid
                LIMIT 1
                """
            ),
            {"uid": user_id},
        ).fetchone()
        new_plan = str(payload.get("new_plan") or "").strip().lower()
        curr_name = str((sub.plan_name if sub else "") or "").strip().lower()
        curr_id = str((sub.plan_id if sub else "") or "").strip().lower()
        if not sub or (new_plan and new_plan not in (curr_name, curr_id)):
            return "skip", f"Stale: user plan is now '{curr_name or curr_id}' (email was for '{new_plan}')"
        return "requeue", f"User plan is still '{sub.plan_name or sub.plan_id}'"

    # 5. Support ticket emails
    if etype.startswith("support_"):
        ticket_id: Optional[str] = payload.get("ticket_id")
        if ticket_id:
            t = db.execute(
                text("SELECT status FROM support_tickets WHERE id::text = :tid LIMIT 1"),
                {"tid": str(ticket_id)},
            ).fetchone()
            if not t:
                return "skip", f"Support ticket {ticket_id} no longer exists"
            return "requeue", f"Support ticket {ticket_id} exists (status={t.status})"

    return "requeue", "No staleness detected"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Apply changes and drain outbox")
    parser.add_argument("--dry-run", action="store_true", help="Preview only (default)")
    args = parser.parse_args()
    apply_changes = bool(args.apply)

    with SessionLocal() as db:
        rows = db.execute(
            text(
                """
                SELECT id, user_id, to_email, type, status, attempts, max_attempts, error, idempotency_key, payload, created_at
                FROM email_logs
                WHERE status = 'failed'
                ORDER BY created_at ASC
                """
            )
        ).fetchall()

        print(f"Found {len(rows)} failed email_logs row(s). Mode: {'APPLY' if apply_changes else 'DRY-RUN'}\n")
        requeued = 0
        skipped = 0

        for r in rows:
            action, reason = _check_email_validity(db, r)
            print(f"[{action.upper():7s}] id={r.id} type={r.type} to={r.to_email} | {reason}")
            if apply_changes:
                if action == "requeue":
                    db.execute(
                        text(
                            """
                            UPDATE email_logs
                            SET status = 'queued',
                                error = NULL,
                                locked_at = NULL,
                                next_attempt_at = now(),
                                max_attempts = GREATEST(max_attempts, attempts + 5),
                                updated_at = now()
                            WHERE id = :id
                            """
                        ),
                        {"id": r.id},
                    )
                    requeued += 1
                else:
                    db.execute(
                        text(
                            """
                            UPDATE email_logs
                            SET status = 'skipped',
                                error = :reason,
                                locked_at = NULL,
                                next_attempt_at = NULL,
                                updated_at = now()
                            WHERE id = :id
                            """
                        ),
                        {"id": r.id, "reason": f"Skipped during reconciliation: {reason}"[:500]},
                    )
                    skipped += 1
            else:
                if action == "requeue":
                    requeued += 1
                else:
                    skipped += 1

        if apply_changes:
            db.commit()
            print(f"\nCommitted: {requeued} re-queued, {skipped} marked skipped.")
            if requeued > 0:
                print("Draining outbox now...")
                res = process_email_outbox(db, max_batch=50)
                print(f"Outbox drain result: {res}")
        else:
            print(f"\nDry-run summary: {requeued} would be re-queued, {skipped} would be marked skipped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
