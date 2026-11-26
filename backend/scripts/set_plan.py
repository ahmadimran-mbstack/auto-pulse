"""Admin CLI script to assign a user's plan by email.

Usage:
    python scripts/set_plan.py <email> <plan> [--interval monthly|annual]
"""

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import text  # noqa: E402
from app.core.plans import get_plans  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.services.entitlements import get_entitlements, set_user_plan  # noqa: E402


def resolve_user_id_by_email(db, email: str) -> str:
    """Look up Neon Auth user id by email in neon_auth.user."""
    row = db.execute(
        text('SELECT id::text FROM neon_auth."user" WHERE LOWER(email) = LOWER(:email) LIMIT 1'),
        {"email": email.strip()},
    ).fetchone()
    if not row:
        raise SystemExit(f"Error: no user found in neon_auth.user for email '{email}'")
    return row[0]


def main() -> None:
    parser = argparse.ArgumentParser(description="Set a user's AutoPulse plan.")
    parser.add_argument("email", help="User email address")
    parser.add_argument("plan", choices=list(get_plans().keys()), help="Target plan id")
    parser.add_argument(
        "--interval",
        choices=["monthly", "annual"],
        default=None,
        help="Billing interval for paid plans (defaults to monthly)",
    )
    args = parser.parse_args()

    with SessionLocal() as db:
        user_id = resolve_user_id_by_email(db, args.email)
        sub = set_user_plan(db, user_id=user_id, plan_id=args.plan, interval=args.interval)
        db.commit()
        entitlements = get_entitlements(db, user_id=user_id)
        print(
            json.dumps(
                {
                    "email": args.email,
                    "user_id": sub.user_id,
                    "plan_id": sub.plan_id,
                    "status": entitlements["status"],
                    "billing_interval": sub.billing_interval,
                    "trial_ends_at": entitlements["trial_ends_at"],
                    "current_period_start": entitlements["current_period_start"],
                    "current_period_end": entitlements["current_period_end"],
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    main()
