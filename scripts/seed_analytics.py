"""Root convenience wrapper for backend/scripts/seed_analytics.py."""
from pathlib import Path
import runpy
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_SCRIPT = ROOT_DIR / "backend" / "scripts" / "seed_analytics.py"

if __name__ == "__main__":
    sys.path.insert(0, str(ROOT_DIR / "backend"))
    runpy.run_path(str(BACKEND_SCRIPT), run_name="__main__")

