import json
from pathlib import Path
import sys

# Ensure backend directory is in python path
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Ensure Windows stdout handles utf-8 characters and emojis safely
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

from app.core.config import settings
from app.services.pipeline import build_graph, create_chat_model
from app.services.search import get_search_adapter


def run_partial_evaluation():
    if not settings.GENERATION_ENABLED:
        print("GENERATION_ENABLED is False; exiting.", flush=True)
        return

    # Load 5 test profiles
    fixtures_file = BACKEND_DIR / "tests" / "fixtures" / "profiles.json"
    with open(fixtures_file, "r", encoding="utf-8") as f:
        profiles = json.load(f)

    # Instantiate LLMs and search tool
    fast_model = create_chat_model(settings.LLM_MODEL_FAST)
    main_model = create_chat_model(settings.LLM_MODEL)
    search_tool = get_search_adapter(settings.SEARCH_PROVIDER)

    # Build graphs
    full_app = build_graph(fast_model, main_model, search_tool, partial=False)
    partial_app = build_graph(fast_model, main_model, search_tool, partial=True)

    mermaid_code = full_app.get_graph().draw_mermaid()
    print("=== MERMAID DIAGRAM ===", flush=True)
    print(mermaid_code, flush=True)
    print("=== END MERMAID DIAGRAM ===\n", flush=True)

    results = []
    output_dir = BACKEND_DIR / "eval_output"
    output_dir.mkdir(parents=True, exist_ok=True)

    for idx, profile in enumerate(profiles, 1):
        user_id = profile.get("user_id")
        role = profile.get("role_title")
        print(f"[{idx}/5] Processing: {role} ({user_id})...", flush=True)

        initial_state = {
            "profile": profile,
            "recent_titles": [],
            "recent_captions": [],
            "rewrite_count": 0,
            "counters": {"search_calls": 0, "llm_calls": 0, "tokens_in": 0, "tokens_out": 0},
            "seconds_per_node": {},
        }

        final_state = partial_app.invoke(initial_state)

        queries = final_state.get("queries", [])
        candidates = final_state.get("candidates", [])
        chosen = final_state.get("chosen", {})
        angle = final_state.get("angle")
        reason = final_state.get("pick_reason")
        err = final_state.get("error_code")
        err_detail = final_state.get("error_detail")

        profile_res = {
            "profile": role,
            "user_id": user_id,
            "queries": queries,
            "candidates_count": len(candidates),
            "chosen_topic": chosen.get("title") if chosen else None,
            "chosen_url": chosen.get("url") if chosen else None,
            "chosen_date": chosen.get("published_at") if chosen else None,
            "chosen_source": chosen.get("source_name") if chosen else None,
            "sources": [
                {
                    "title": c.get("title"),
                    "url": c.get("url"),
                    "published_at": c.get("published_at"),
                    "source_name": c.get("source_name"),
                }
                for c in candidates[:3]
            ],
            "angle": angle,
            "reason": reason,
            "error_code": err,
            "error_detail": err_detail,
            "seconds_per_node": final_state.get("seconds_per_node", {}),
        }
        results.append(profile_res)

        print(f"    Queries: {queries}", flush=True)
        print(f"    Candidates Found: {len(candidates)}", flush=True)
        print(f"    Chosen Topic: {profile_res['chosen_topic']}", flush=True)
        print(f"    Chosen URL: {profile_res['chosen_url']}", flush=True)
        print(f"    Published Date: {profile_res['chosen_date']}", flush=True)
        print(f"    Angle: {angle}", flush=True)
        print(f"    Reason: {reason}", flush=True)
        print(f"    Error: {err}", flush=True)
        print(f"    Timing: {final_state.get('seconds_per_node', {})}\n", flush=True)

        # Save progress after each profile
        out_file = output_dir / "partial_eval_results.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)

    print("=== PARTIAL EVALUATION COMPLETED ===", flush=True)


if __name__ == "__main__":
    run_partial_evaluation()
