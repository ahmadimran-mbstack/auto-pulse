"""Export public plans config to frontend/lib/plans.snapshot.json.

Usage:
    python backend/scripts/export_plans_snapshot.py
"""

import json
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.services.entitlements import get_public_plans_payload  # noqa: E402

SNAPSHOT_PATH = REPO_ROOT / "frontend" / "lib" / "plans.snapshot.json"


def build_snapshot_dict() -> dict:
    payload = get_public_plans_payload(use_defaults=True)
    return {
        "_note": "Generated from backend/app/core/plans.py by backend/scripts/export_plans_snapshot.py. Do not edit by hand.",
        **payload,
    }


def main() -> None:
    SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = build_snapshot_dict()
    SNAPSHOT_PATH.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {SNAPSHOT_PATH}")


if __name__ == "__main__":
    main()
