import json
import logging
import os
from pathlib import Path
import sys
import time
from typing import Any, List

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.agents.detector import DetectorLLMOutput, LLMFinding, LLMSubScores
from app.agents.drafter import DrafterOutput
from app.agents.finder import FinderOutput, FinderSource
from app.agents.gtm import GTMBriefOutput, GTMReviewOutput
from app.core.config import settings
from app.services.pipeline import execute_pipeline
from app.services.search import Candidate

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("demo_pipeline_loop")


class MockStructuredChatModel(FakeChatModel):
    responses: list = []
    default_response: Any = None
    call_count: int = 0

    def with_structured_output(self, schema, **kwargs):
        def _invoke(prompt_val):
            self.call_count += 1
            if self.responses and self.call_count <= len(self.responses):
                resp = self.responses[self.call_count - 1]
            else:
                resp = self.default_response
            return {"parsed": resp, "raw": AIMessage(content="mock")}

        return RunnableLambda(_invoke)


class StaticCandidateSearch:
    def __init__(self, candidates):
        self.candidates = candidates

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10):
        return self.candidates


def main():
    print("=" * 80)
    print("AUTOPULSE PHASE 6: COOPERATIVE 4-AGENT LANGGRAPH PIPELINE & REWRITE LOOP DEMO")
    print("=" * 80)

    # 1. Realistic user profile and search candidates
    profile = {
        "role_title": "Principal Database Architect",
        "industry": "High-Throughput Data Infrastructure",
        "niche_description": "PostgreSQL performance tuning, connection pooling, buffer pool contention, query optimization",
        "audience": "Staff engineers, infrastructure leads, and database administrators",
        "tone": "direct, technically concrete, analytical, zero marketing fluff",
        "voice_notes": "Ground every claim in measurable hardware benchmarks and reproducible system metrics",
        "topics_include": ["PostgreSQL", "Database Internals", "Performance Benchmarks"],
        "topics_avoid": ["Crypto", "Generic AI Hype", "Basic Tutorials"],
        "brand_name": "DataPulse",
        "brand_primary_hex": "#0F172A",
        "brand_accent_hex": "#38BDF8",
    }

    cand = Candidate(
        title="PostgreSQL 16 Shared Buffer Contention Benchmarks",
        url="https://example.com/pg16-buffer-benchmarks",
        text=(
            "PostgreSQL 16 benchmark results show 42% latency reduction under 400 active client connections. "
            "In synthetic load tests where backends spent 35% waiting, latency fell from 120ms to 18ms under concurrent load."
        ),
        published_at="2026-10-28T09:00:00Z",
        source_name="Postgres Weekly",
    )

    history = [
        {"title": "B-Tree Index Bloat in High-Volume Delete Workloads", "created_at": "2026-10-20"},
        {"title": "Connection Pooling Limits with PgBouncer vs Odyssey", "created_at": "2026-10-22"},
    ]

    print("\n[CONFIGURATION]")
    print(f"  Role Title:           {profile['role_title']}")
    print(f"  AI Score Threshold:   {settings.AI_SCORE_THRESHOLD} (below is passing)")
    print(f"  Max Rewrite Rounds:   {settings.MAX_REWRITE_ROUNDS}")
    print(f"  Max LLM Calls:        {settings.MAX_LLM_CALLS_PER_RUN}")
    print(f"  Cooperating Agents:   1. Post Finder | 2. GTM Brief & Review | 3. Post Drafter | 4. AI-Slop Detector")

    # Configure multi-round cooperating agents:
    # Finder
    finder_resp = FinderOutput(
        topic="PostgreSQL 16 Shared Buffer Contention Benchmarks",
        angle="Why atomic buffer locks change high-concurrency throughput",
        post_format="observer take",
        hook_type="number-led specific result",
        why_now="New PG16 concurrency benchmarks released",
        sources=[FinderSource(title=cand.title, url=cand.url)],
    )

    # GTM Brief (Pre-Draft)
    gtm_brief_resp = GTMBriefOutput(
        hook_options=[
            "PostgreSQL 16 dropped buffer locks by 42% under 400 concurrent connections.",
            "Why shared buffer pool contention kills database throughput.",
            "The lock-free allocation shift inside PostgreSQL 16.",
        ],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42% under 400 concurrent connections.",
        structure_lines=[
            "1. Hook: 42% reduction in buffer contention under 400 active connections.",
            "2. Pain point: Legacy shared buffer pool locks forced compute over-provisioning.",
            "3. Architecture fix: Atomic buffer pinning keeps active read paths lock-free.",
            "4. Empirical takeaway: p99 latency dropped from 120ms to 18ms without index changes.",
        ],
        ending_strategy="Decisive technical command [END-01].",
        notes=["[HOOK-01] Valid empirical opening.", "[END-01] Clear diagnostic takeaway."],
    )

    # Round 0 draft (contains slop words: 'delve' and 'game-changer', score = 42)
    draft_r0 = DrafterOutput(
        post_text=(
            "PostgreSQL 16 dropped buffer locks by 42% under 400 active client connections.\n\n"
            "As we delve into high-concurrency workloads, shared buffer contention regularly stalls critical queries. "
            "Under write-heavy transaction volume, backends spent up to 35% of total query execution time waiting for buffer mapping lock acquisitions across shared memory partitions. "
            "The legacy engine spent CPU cycles coordinating shared buffer pool locks on concurrent updates. "
            "This architectural bottleneck was a true game-changer for teams forced to over-provision compute nodes.\n\n"
            "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
            "In synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
            "Benchmark buffer pool saturation before approving compute upgrades."
        ),
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    # Round 1 draft (targeted span rewrite: removes 'delve' and 'game-changer', clean score = 4)
    draft_r1 = DrafterOutput(
        post_text=(
            "PostgreSQL 16 dropped buffer locks by 42% under 400 active client connections.\n\n"
            "In production workloads running high-concurrency workloads, shared buffer contention regularly stalls critical queries. "
            "Under write-heavy transaction volume, backends spent up to 35% of total query execution time waiting for buffer mapping lock acquisitions across shared memory partitions. "
            "The legacy engine spent CPU cycles coordinating shared buffer pool locks on concurrent updates. "
            "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
            "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
            "In synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
            "Benchmark buffer pool saturation before approving compute upgrades."
        ),
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    # Detector Round 0 (flags 2 slop phrases, score = 42)
    detector_r0 = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=35, structure=10, rhythm=8, specificity=5, tone=15),
        llm_score=42,
        findings=[
            LLMFinding(category="vocabulary", quote="delve", explanation="Banned strong slop tell (delve)"),
            LLMFinding(category="vocabulary", quote="game-changer", explanation="Banned buzzword (game-changer)"),
        ],
    )

    # Detector Round 1 (clean, score = 4)
    detector_r1 = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=2, structure=2, rhythm=2, specificity=2, tone=2),
        llm_score=4,
        findings=[],
    )

    # GTM Review (Post-Loop)
    gtm_review_resp = GTMReviewOutput(
        hook_strength=9,
        review_notes=[
            "Empirical number-led hook [HOOK-01] provides strong technical tension.",
            "Decisive close [END-01] commands immediate operational action.",
        ],
    )

    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["postgres 16 buffer locks", "pg16 concurrency", "database throughput"]}),
        "finder": MockStructuredChatModel(default_response=finder_resp),
        "gtm_brief": MockStructuredChatModel(default_response=gtm_brief_resp),
        "gtm_review": MockStructuredChatModel(default_response=gtm_review_resp),
        "drafter": MockStructuredChatModel(responses=[draft_r0, draft_r1], default_response=draft_r1),
        "detector": MockStructuredChatModel(responses=[detector_r0, detector_r1], default_response=detector_r1),
    }

    # Track progress steps reported via step_callback
    progress_log = []

    def progress_tracker(step_name: str, round_num: int, state: dict):
        timestamp = time.strftime("%H:%M:%S")
        progress_log.append((timestamp, step_name, round_num))
        print(f"  [{timestamp}] ⚡ Step: {step_name.upper():<12} | Round: {round_num}")

    print("\n[EXECUTING COOPERATIVE PIPELINE GRAPH]...")
    search_tool = StaticCandidateSearch([cand])

    start_time = time.perf_counter()
    final_state = execute_pipeline(
        user_id="demo_user_1",
        profile_dict=profile,
        history=history,
        search_tool=search_tool,
        models=models,
        step_callback=progress_tracker,
    )
    total_duration = time.perf_counter() - start_time

    print(f"\nPipeline finished in {total_duration:.3f}s!")

    if final_state.get("error_code"):
        print(f"\n❌ Pipeline failed with error: {final_state.get('error_code')} - {final_state.get('error_detail')}")
        return

    # Extract final assets
    draft = final_state.get("draft", {})
    finder = final_state.get("finder_output", {})
    gtm_brief = final_state.get("gtm_brief", {})
    gtm_rev = final_state.get("gtm_review", {})
    trace = final_state.get("agent_trace", {})

    print("\n" + "=" * 80)
    print("1. POST FINDER OUTPUT (Topic Selection & Angle)")
    print("=" * 80)
    print(f"Topic:       {finder.get('topic')}")
    print(f"Angle:       {finder.get('angle')}")
    print(f"Post Format: {finder.get('post_format')}")
    print(f"Hook Type:   {finder.get('hook_type')}")
    print(f"Why Now:     {finder.get('why_now')}")

    print("\n" + "=" * 80)
    print("2. GTM AGENT BRIEF (Job 1: Pre-Draft Strategy)")
    print("=" * 80)
    print(f"Chosen Hook:      {gtm_brief.get('chosen_hook')}")
    print("Structure Plan:")
    for idx, s in enumerate(gtm_brief.get("structure_lines", []), 1):
        print(f"  {idx}. {s}")
    print(f"Ending Strategy:  {gtm_brief.get('ending_strategy')}")
    print(f"Playbook Notes:   {gtm_brief.get('notes')}")

    print("\n" + "=" * 80)
    print("3. REWRITE LOOP PROGRESSION & DETECTOR SCORING")
    print("=" * 80)
    rounds = trace.get("rounds", [])
    print(f"Total Rounds Executed: {len(rounds)}")
    for r in rounds:
        r_num = r.get("round")
        f_score = r.get("final_score")
        det_score = r.get("deterministic_score")
        llm_score = r.get("llm_score")
        findings_count = r.get("findings_count", 0)
        checks = r.get("check_failures", [])
        print(f"\n--- Round {r_num} ---")
        print(f"  AI-Slop Score: {f_score}/100 (deterministic: {det_score}, LLM judge: {llm_score})")
        print(f"  Flagged Findings: {findings_count}")
        for finding in r.get("findings", []):
            cat = finding.get("category")
            quote = finding.get("quote")
            explanation = finding.get("explanation")
            print(f"    • [{cat}] \"{quote}\" -> {explanation}")
        if checks:
            print(f"  Deterministic Check Failures: {checks}")
        else:
            print("  Deterministic Checks: All Passed ✓")

    print("\n" + "=" * 80)
    print("4. GTM REVIEW (Job 2: Post-Loop Hook Audit)")
    print("=" * 80)
    print(f"Hook Strength Score: {gtm_rev.get('hook_strength')}/10")
    print("Review Notes:")
    for note in gtm_rev.get("review_notes", []):
        print(f"  • {note}")

    print("\n" + "=" * 80)
    print("5. FINAL SELECTED POST DRAFT")
    print("=" * 80)
    caption = draft.get("post_text", "")
    print(f"Length: {len(caption)} characters (Requirement: 700-1800)")
    print("-" * 40)
    print(caption)
    print("-" * 40)
    print(f"Hashtags:       {draft.get('hashtags')}")
    print(f"Image Headline: {draft.get('image_headline')}")

    print("\n" + "=" * 80)
    print("6. AGENT TRACE & DECISION AUDIT")
    print("=" * 80)
    print(f"Exit Reason:       {trace.get('exit_reason')}")
    print(f"Best Round:        Round {trace.get('best_round')}")
    print(f"Final Score:       {trace.get('final_score')} (Initial: 42 -> Final: 4)")
    print(f"Needs Review Flag: {trace.get('needs_review')} (Score < 15 and all checks passed -> False)")
    print("\nPer-Node Timings (seconds):")
    for node, sec in trace.get("timings", {}).items():
        print(f"  - {node:<18}: {sec:>6.3f}s")
    print("\nAudit Counters:")
    for k, v in trace.get("counters", {}).items():
        print(f"  - {k:<18}: {v}")


if __name__ == "__main__":
    main()
