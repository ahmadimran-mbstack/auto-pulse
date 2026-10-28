import argparse
from collections import Counter
from pathlib import Path
import sys
from typing import Dict, List, Tuple

# Ensure backend directory is in sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure Windows stdout handles utf-8 characters safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from app.agents.detector import evaluate_post
from app.core.config import settings
from app.services.pipeline import create_chat_model


def resolve_sample_dirs(custom_base: str = None) -> Tuple[Path, Path, Path]:
    candidates = []
    if custom_base:
        candidates.append(Path(custom_base))
    candidates.extend(
        [
            BACKEND_DIR / "calibration",
            BACKEND_DIR.parent / "calibration",
            BACKEND_DIR / "tests" / "fixtures" / "calibration",
            Path.cwd() / "calibration",
        ]
    )

    for base in candidates:
        h_dir = base / "human_samples"
        lazy_dir = base / "ai_lazy"
        inst_dir = base / "ai_instructed"
        if h_dir.exists() and (lazy_dir.exists() or inst_dir.exists()):
            lazy_dir.mkdir(parents=True, exist_ok=True)
            inst_dir.mkdir(parents=True, exist_ok=True)
            return h_dir, lazy_dir, inst_dir

    # Default location: backend/calibration
    default_base = BACKEND_DIR / "calibration"
    h_dir = default_base / "human_samples"
    lazy_dir = default_base / "ai_lazy"
    inst_dir = default_base / "ai_instructed"
    h_dir.mkdir(parents=True, exist_ok=True)
    lazy_dir.mkdir(parents=True, exist_ok=True)
    inst_dir.mkdir(parents=True, exist_ok=True)

    # Migrate any old ai_samples into ai_lazy if present
    old_ai_dir = default_base / "ai_samples"
    if old_ai_dir.exists():
        for old_file in old_ai_dir.glob("*.txt"):
            target = lazy_dir / old_file.name
            if not target.exists():
                target.write_text(old_file.read_text(encoding="utf-8"), encoding="utf-8")

    return h_dir, lazy_dir, inst_dir


def process_folder(
    folder_path: Path,
    label: str,
    model=None,
    runs_per_post: int = 3,
) -> Tuple[List[dict], Counter]:
    results = []
    rule_counter = Counter()
    files = sorted(list(folder_path.glob("*.txt")))

    print(f"\n=======================================================")
    print(f"  EVALUATING {label.upper()}: {folder_path.name} ({len(files)} files)")
    print(f"=======================================================")

    if not files:
        print(f"  (No .txt files found in {folder_path}. Drop .txt samples here to calibrate.)")
        return results, rule_counter

    for fpath in files:
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()

        if not content.strip():
            continue

        llm_runs = []
        det_score = 0
        all_findings = []

        # Run LLM judge runs_per_post times to observe spread
        for run_idx in range(runs_per_post):
            eval_res = evaluate_post(
                post_text=content,
                sources=None,
                model=model,
                threshold=settings.AI_SCORE_THRESHOLD,
            )
            det_score = eval_res.deterministic_score
            llm_runs.append(eval_res.llm_score)
            if run_idx == 0:
                all_findings = eval_res.findings
                for finding in eval_res.findings:
                    if finding.points is None or finding.points > 0:
                        rule_counter[f"{finding.rule_id} ({finding.category})"] += 1

        min_llm = min(llm_runs)
        max_llm = max(llm_runs)
        spread = max_llm - min_llm
        avg_llm = round(sum(llm_runs) / len(llm_runs), 1)
        final_score = max(det_score, int(round(avg_llm)))
        passed = final_score < settings.AI_SCORE_THRESHOLD

        item = {
            "filename": fpath.name,
            "deterministic_score": det_score,
            "llm_runs": llm_runs,
            "llm_min": min_llm,
            "llm_max": max_llm,
            "llm_spread": spread,
            "avg_llm": avg_llm,
            "final_score": final_score,
            "passed": passed,
            "findings": all_findings,
        }
        results.append(item)

        status_str = "PASS   " if passed else "FLAGGED"
        runs_str = ", ".join(f"{s:2}" for s in llm_runs)
        spread_alert = " [WARNING: SPREAD > 8!]" if spread > 8 else ""

        print(
            f"[{status_str}] {fpath.name:25} | Det: {det_score:2} | "
            f"LLM Runs: [{runs_str}] (spread: {spread:2}) | Final: {final_score:2}{spread_alert}"
        )

    return results, rule_counter


def run_calibration():
    parser = argparse.ArgumentParser(description="Calibrate AI-Slop Detector against human, AI lazy, and AI instructed text samples.")
    parser.add_argument("--dir", default=None, help="Directory containing sample folders")
    parser.add_argument("--runs", type=int, default=3, help="Number of LLM judge runs per post to test spread (default: 3)")
    args = parser.parse_args()

    human_dir, lazy_dir, inst_dir = resolve_sample_dirs(args.dir)

    model = None
    if settings.LLM_API_KEY:
        try:
            model = create_chat_model(settings.LLM_MODEL_DETECTOR, temperature=0.0)
            print(f"Loaded detector LLM model: {settings.LLM_MODEL_DETECTOR} (temperature=0.0)")
        except Exception as exc:
            print(f"Error loading LLM model: {exc}")
            model = None
    else:
        print("Warning: No LLM_API_KEY configured. Running deterministic scanner only.")

    human_results, human_rule_counts = process_folder(human_dir, "Human Samples", model=model, runs_per_post=args.runs)
    lazy_results, _ = process_folder(lazy_dir, "AI-Generated (Lazy / Zero-Shot)", model=model, runs_per_post=args.runs)
    inst_results, _ = process_folder(inst_dir, "AI-Generated (Instructed / Anti-Slop Prompted)", model=model, runs_per_post=args.runs)

    print("\n=======================================================")
    print("                 CALIBRATION SUMMARY                   ")
    print("=======================================================")
    print(f"Current threshold: {settings.AI_SCORE_THRESHOLD}")

    # Check for any post with score spread > 8 points
    all_results = human_results + lazy_results + inst_results
    high_spread_posts = [r for r in all_results if r["llm_spread"] > 8]
    if high_spread_posts:
        print(f"\n[!] HIGH VARIANCE ALERT: {len(high_spread_posts)} post(s) had score spreads > 8 points across {args.runs} runs:")
        for r in high_spread_posts:
            print(f"    - {r['filename']}: runs={r['llm_runs']}, spread={r['llm_spread']}")
    else:
        print(f"\n[OK] Consistency Check: Zero posts exceeded an 8-point score spread across {args.runs} runs.")

    # False Positive Report for Human Samples
    if human_results:
        print("\n-------------------------------------------------------")
        print("         FALSE POSITIVE REPORT (HUMAN SAMPLES)         ")
        print("-------------------------------------------------------")
        if human_rule_counts:
            print(f"{'Rule ID & Category':50} | {'Fired Count':10}")
            print("-" * 65)
            for rule_id, count in human_rule_counts.most_common():
                print(f"{rule_id:50} | {count:10}")
        else:
            print("No rules fired on human samples! (0 false positives)")

    # Folder summaries
    for folder_name, folder_res in [
        ("Human Samples", human_results),
        ("AI Lazy Samples", lazy_results),
        ("AI Instructed Samples", inst_results),
    ]:
        if folder_res:
            pass_count = sum(1 for r in folder_res if r["passed"])
            pass_rate = (pass_count / len(folder_res)) * 100
            avg_det = sum(r["deterministic_score"] for r in folder_res) / len(folder_res)
            avg_llm = sum(r["avg_llm"] for r in folder_res) / len(folder_res)
            avg_final = sum(r["final_score"] for r in folder_res) / len(folder_res)
            print(f"\n{folder_name} ({len(folder_res)} files):")
            print(f"  Pass Rate (Score < {settings.AI_SCORE_THRESHOLD}): {pass_rate:.1f}% ({pass_count}/{len(folder_res)})")
            print(f"  Avg Deterministic: {avg_det:.1f}")
            print(f"  Avg LLM Score:     {avg_llm:.1f}")
            print(f"  Avg Final Score:   {avg_final:.1f}")

    print("\nCalibration ready. Do not adjust weights or thresholds until your real sample folders are filled.")


if __name__ == "__main__":
    run_calibration()
