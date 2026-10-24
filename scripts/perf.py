import sys
from pathlib import Path

# Forward to backend/scripts/perf.py
script_path = Path(__file__).resolve().parent / "backend" / "scripts" / "perf.py"
if script_path.exists():
    with open(script_path, "rb") as f:
        code = compile(f.read(), str(script_path), "exec")
        exec(code, globals())
else:
    print(f"Could not locate {script_path}")
    sys.exit(1)
