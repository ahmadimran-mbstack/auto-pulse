"""Ensure frontend/lib/plans.snapshot.json stays in sync with backend/app/core/plans.py."""

import json
from pathlib import Path

from scripts.export_plans_snapshot import SNAPSHOT_PATH, build_snapshot_dict


def test_plans_snapshot_is_up_to_date():
    assert SNAPSHOT_PATH.exists(), (
        f"Missing {SNAPSHOT_PATH}. Run: python backend/scripts/export_plans_snapshot.py"
    )
    disk_data = json.loads(SNAPSHOT_PATH.read_text(encoding="utf-8"))
    expected = build_snapshot_dict()
    assert disk_data == expected, (
        "frontend/lib/plans.snapshot.json is out of date. "
        "Run: python backend/scripts/export_plans_snapshot.py"
    )
