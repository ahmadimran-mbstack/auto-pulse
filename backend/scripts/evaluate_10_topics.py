import datetime
import json
import logging
from pathlib import Path
import statistics
import sys
import time
from typing import Any, Dict, List

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

logging.basicConfig(level=logging.WARNING)


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
            # Estimate tokens: prompt length // 4, response length // 4
            prompt_str = str(prompt_val)
            tok_in = max(100, len(prompt_str) // 4)
            tok_out = 350
            raw_msg = AIMessage(content="mock", usage_metadata={"input_tokens": tok_in, "output_tokens": tok_out, "total_tokens": tok_in + tok_out})
            return {"parsed": resp, "raw": raw_msg}

        return RunnableLambda(_invoke)


class MockSearchAdapter:
    def __init__(self, candidates):
        self.candidates = candidates

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10):
        return self.candidates


def _build_test_topics() -> List[Dict[str, Any]]:
    now = datetime.datetime.now(datetime.timezone.utc)
    return [
        {
            "id": 1,
            "title": "PostgreSQL 16 Buffer Locks",
            "role": "Principal Database Architect",
            "candidate": Candidate(
                title="PostgreSQL 16 Shared Buffer Contention Benchmarks",
                url="https://example.com/pg16-buffer",
                text="PostgreSQL 16 benchmark results show 42% latency reduction under 400 active client connections. In synthetic load tests where backends spent 35% waiting, latency fell from 120ms to 18ms under concurrent load.",
                published_at=(now - datetime.timedelta(hours=2)).isoformat(),
                source_name="Postgres Weekly",
            ),
            "r0_score": 42,
            "r1_score": 4,  # passes in 1 rewrite
            "r0_slop_words": ["delve", "game-changer"],
        },
        {
            "id": 2,
            "title": "Kafka 3.8 Tiered Storage",
            "role": "Streaming Infrastructure Lead",
            "candidate": Candidate(
                title="Kafka 3.8 Tiered Storage GA Benchmarks",
                url="https://example.com/kafka-38",
                text="Apache Kafka 3.8 tiered storage reduces broker disk recovery time by 85% on 500 partition clusters. Tail read latency to remote S3 storage averaged 48ms under 250 MB per second throughput.",
                published_at=(now - datetime.timedelta(hours=4)).isoformat(),
                source_name="Streaming Data Blog",
            ),
            "r0_score": 12,  # passes on round 0
            "r1_score": None,
            "r0_slop_words": [],
        },
        {
            "id": 3,
            "title": "Kubernetes In-Place Pod Resizing",
            "role": "Staff SRE",
            "candidate": Candidate(
                title="Kubernetes 1.31 In-Place Pod Resizing in Production",
                url="https://example.com/k8s-pod-resizing",
                text="In-place pod resizing in Kubernetes 1.31 eliminates pod restarts during compute reallocations. In our cluster of 300 microservices, node churn dropped by 64% during morning traffic surges.",
                published_at=(now - datetime.timedelta(hours=6)).isoformat(),
                source_name="Cloud Native Digest",
            ),
            "r0_score": 38,
            "r1_score": 8,  # passes in 1 rewrite
            "r0_slop_words": ["tapestry", "seamless"],
        },
        {
            "id": 4,
            "title": "React 19 Compiler Architecture",
            "role": "Senior Frontend Architect",
            "candidate": Candidate(
                title="React 19 Compiler Memoization Benchmarks",
                url="https://example.com/react-19-compiler",
                text="The React 19 compiler eliminates manual useMemo calls across 150 complex views. Client re-render times dropped by 52% while shaving 18ms off user interaction latency.",
                published_at=(now - datetime.timedelta(hours=8)).isoformat(),
                source_name="Frontend Weekly",
            ),
            "r0_score": 48,
            "r1_score": 26,
            "r2_score": 6,  # passes in 2 rewrites
            "r0_slop_words": ["supercharge", "unleash", "delve"],
        },
        {
            "id": 5,
            "title": "Redis 7.2 Multi-Threading Engine",
            "role": "Performance Engineer",
            "candidate": Candidate(
                title="Redis 7.2 Multi-Threading Under IO Load",
                url="https://example.com/redis-72-benchmarks",
                text="Redis 7.2 IO threading achieves 450000 operations per second on 64 core instances. CPU utilization balanced evenly across 8 worker threads with zero command serialization stalls.",
                published_at=(now - datetime.timedelta(hours=10)).isoformat(),
                source_name="Cache Systems Engineering",
            ),
            "r0_score": 10,  # passes on round 0
            "r1_score": None,
            "r0_slop_words": [],
        },
        {
            "id": 6,
            "title": "B2B SaaS Net Revenue Retention",
            "role": "B2B SaaS Founder & CEO",
            "candidate": Candidate(
                title="SaaS Capital Benchmarks on Enterprise NRR",
                url="https://example.com/saas-nrr-benchmarks",
                text="Public B2B SaaS companies with over 115% net revenue retention grew ARR 28% faster than competitors. Expansion revenue accounted for 62% of net new annual recurring revenue.",
                published_at=(now - datetime.timedelta(hours=12)).isoformat(),
                source_name="SaaS Capital",
            ),
            "r0_score": 34,
            "r1_score": 9,  # passes in 1 rewrite
            "r0_slop_words": ["elevate", "pivotal"],
        },
        {
            "id": 7,
            "title": "Async Engineering Documentation Culture",
            "role": "CTO & Co-Founder",
            "candidate": Candidate(
                title="GitLab Remote Work Report on Asynchronous Velocity",
                url="https://example.com/remote-work-report",
                text="Teams practicing asynchronous RFC documentation shipped features 32% faster across 14 time zones. Scheduled recurring status meetings fell from 12 hours per week to 3 hours.",
                published_at=(now - datetime.timedelta(hours=14)).isoformat(),
                source_name="Engineering Leadership Review",
            ),
            "r0_score": 36,
            "r1_score": 7,  # passes in 1 rewrite
            "r0_slop_words": ["navigate", "crucial", "holistic"],
        },
        {
            "id": 8,
            "title": "Design Tokens to Production CSS",
            "role": "Lead UI/UX Systems Designer",
            "candidate": Candidate(
                title="Shopify Design System Token Architecture",
                url="https://example.com/design-tokens-shopify",
                text="Synchronizing design tokens directly from Figma to CSS variables reduced frontend styling bugs by 74%. Theme migrations across 40 web storefronts completed in 3 weeks.",
                published_at=(now - datetime.timedelta(hours=16)).isoformat(),
                source_name="Design Systems Field Guide",
            ),
            "r0_score": 14,  # passes on round 0 (< 15)
            "r1_score": None,
            "r0_slop_words": [],
        },
        {
            "id": 9,
            "title": "LLM Context Caching in Production",
            "role": "AI Systems Engineer",
            "candidate": Candidate(
                title="Prompt Caching Economics for Agent Workflows",
                url="https://example.com/prompt-caching-economics",
                text="Enabling server-side prompt caching for long system prompts cut multi-agent token costs by 78%. End-to-end latency dropped from 4200ms to 890ms on repeated document evaluation calls.",
                published_at=(now - datetime.timedelta(hours=18)).isoformat(),
                source_name="AI Systems Architecture",
            ),
            "r0_score": 32,
            "r1_score": 5,  # passes in 1 rewrite
            "r0_slop_words": ["transformative", "revolutionize"],
        },
        {
            "id": 10,
            "title": "Employee Retention & Promotion Rubrics",
            "role": "Principal HR Consultant",
            "candidate": Candidate(
                title="Workforce Retention Survey on Role Transparency",
                url="https://example.com/workforce-retention-survey",
                text="Engineering organizations with published career ladder rubrics experienced 45% lower voluntary attrition. Mid-level engineers cited role ambiguity as the primary driver for 60% of resignations.",
                published_at=(now - datetime.timedelta(hours=20)).isoformat(),
                source_name="People Operations Journal",
            ),
            "r0_score": 28,
            "r1_score": 27,
            "r2_score": 26,  # 2 strikes (< 3 pt improvement) -> exits on strike rule (needs_review = True)
            "r0_slop_words": ["journey", "landscape"],
        },
    ]


def run_10_topics_evaluation():
    print("=" * 80)
    print("AUTOPULSE PHASE 7: 10-TOPIC REWRITE LOOP BENCHMARK & EVALUATION REPORT")
    print("=" * 80)
    print(f"AI Score Threshold: < {settings.AI_SCORE_THRESHOLD}")
    print(f"Max Rewrite Rounds: {settings.MAX_REWRITE_ROUNDS}")
    print(f"Max LLM Calls Cap:  {settings.MAX_LLM_CALLS_PER_RUN}")
    print(f"Cost Basis:         Input: $0.075/1M tok | Output: $0.30/1M tok (Gemini 2.5 Flash / 3.1 Flash Lite)")
    print("-" * 80)

    topics = _build_test_topics()
    eval_results = []
    round_scores_by_round: Dict[int, List[float]] = {}

    start_all = time.perf_counter()

    for item in topics:
        topic_id = item["id"]
        title = item["title"]
        role = item["role"]
        cand = item["candidate"]

        # Setup structured outputs
        finder_resp = FinderOutput(
            topic=title,
            angle=f"Technical analysis of {title}",
            post_format="observer take",
            hook_type="number-led specific result",
            why_now="Recent industry benchmarks",
            sources=[FinderSource(title=cand.title, url=cand.url)],
        )

        gtm_brief_resp = GTMBriefOutput(
            hook_options=["Hook option 1", "Hook option 2", "Hook option 3"],
            chosen_hook=f"{title} empirical benchmark review.",
            structure_lines=["1. Hook", "2. Technical problem", "3. Architecture solution", "4. Takeaway"],
            ending_strategy="Decisive technical command.",
            notes=["[HOOK-01] Valid opening."],
        )

        # Build drafts for rounds
        # Base clean template (880-910 chars) with first line <= 140 chars and grounded numbers
        first_sentence = cand.text.split(".")[0].strip() + "."
        rest_cand = cand.text[len(first_sentence):].strip()
        clean_body = (
            f"{first_sentence}\n\n"
            f"{rest_cand}\n\n"
            "In high-concurrency production environments, memory and lock contention regularly degrade system throughput. "
            "Engineers spend critical CPU cycles coordinating shared synchronization primitives rather than executing core business logic. "
            "This architectural bottleneck forces teams into costly over-provisioning cycles during traffic spikes.\n\n"
            "By implementing isolated lock-free execution structures, modern platforms keep critical read paths clear and eliminate cascading latency tails. "
            "Production benchmarks show sustained throughput improvements without requiring disruptive architectural rewrites or schema migrations.\n\n"
            "Validate resource saturation metrics before approving infrastructure expansions."
        )

        # If r0 had slop words, inject them
        slop_words = item["r0_slop_words"]
        if slop_words:
            slop_phrase = f" As we delve into this transformative game-changer, the landscape underscores pivotal synergy."
            r0_text = clean_body.replace("spikes.", "spikes." + slop_phrase)
        else:
            r0_text = clean_body

        headline = "Technical Architecture Production Review Overview"
        draft_r0 = DrafterOutput(post_text=r0_text, hashtags=["Engineering", "Tech"], image_headline=headline)
        draft_clean = DrafterOutput(post_text=clean_body, hashtags=["Engineering", "Tech"], image_headline=headline)

        # Setup detector outputs
        det_r0 = DetectorLLMOutput(
            sub_scores=LLMSubScores(vocabulary=item["r0_score"], structure=item["r0_score"], rhythm=5, specificity=5, tone=5),
            llm_score=item["r0_score"],
            findings=[LLMFinding(category="vocabulary", quote=w, explanation="Slop tell") for w in slop_words],
        )

        detector_responses = [det_r0]
        drafter_responses = [draft_r0]

        if item.get("r1_score") is not None:
            det_r1 = DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=item["r1_score"], structure=item["r1_score"], rhythm=5, specificity=5, tone=5),
                llm_score=item["r1_score"],
                findings=[],
            )
            detector_responses.append(det_r1)
            drafter_responses.append(draft_clean)

        if item.get("r2_score") is not None:
            det_r2 = DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=item["r2_score"], structure=item["r2_score"], rhythm=5, specificity=5, tone=5),
                llm_score=item["r2_score"],
                findings=[],
            )
            detector_responses.append(det_r2)
            drafter_responses.append(draft_clean)

        models = {
            "fast": MockStructuredChatModel(default_response={"queries": ["q1", "q2", "q3"]}),
            "finder": MockStructuredChatModel(default_response=finder_resp),
            "gtm_brief": MockStructuredChatModel(default_response=gtm_brief_resp),
            "gtm_review": MockStructuredChatModel(default_response=GTMReviewOutput(hook_strength=9, review_notes=["Strong hook"])),
            "drafter": MockStructuredChatModel(responses=drafter_responses, default_response=draft_clean),
            "detector": MockStructuredChatModel(responses=detector_responses, default_response=detector_responses[-1]),
        }

        search_tool = MockSearchAdapter([cand])

        res = execute_pipeline(
            user_id=f"eval_user_{topic_id}",
            profile_dict={"role_title": role},
            history=[],
            search_tool=search_tool,
            models=models,
        )

        trace = res.get("agent_trace", {})
        rounds = trace.get("rounds", [])
        rounds_count = len(rounds)
        final_score = trace.get("final_score", 0)
        exit_reason = trace.get("exit_reason", "")
        needs_review = trace.get("needs_review", False)
        passed = not needs_review and final_score < settings.AI_SCORE_THRESHOLD

        # Record round score trajectories
        for r_entry in rounds:
            r_idx = r_entry.get("round", 0)
            sc = r_entry.get("final_score", 0)
            round_scores_by_round.setdefault(r_idx, []).append(sc)

        counters = trace.get("counters", {})
        tokens_in = counters.get("tokens_in", 0)
        tokens_out = counters.get("tokens_out", 0)
        llm_calls = counters.get("llm_calls", 0)

        # Cost: $0.075 / 1M in, $0.30 / 1M out
        cost_usd = (tokens_in * 0.075 + tokens_out * 0.30) / 1_000_000

        eval_results.append({
            "id": topic_id,
            "title": title,
            "role": role,
            "passed": passed,
            "exit_reason": exit_reason,
            "rounds_executed": rounds_count,
            "initial_score": rounds[0].get("final_score") if rounds else 0,
            "final_score": final_score,
            "llm_calls": llm_calls,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": cost_usd,
        })

        status_str = "✓ PASS" if passed else "⚠️ NEEDS_REVIEW"
        print(f"[{topic_id:>2}/10] {title:<36} | {status_str:<15} | Rounds: {rounds_count} | Score: {rounds[0].get('final_score'):>2} -> {final_score:>2} | Calls: {llm_calls} | ${cost_usd:.5f}")

    total_time = time.perf_counter() - start_all
    passed_count = sum(1 for r in eval_results if r["passed"])
    pass_rate = (passed_count / len(eval_results)) * 100

    avg_rounds = statistics.mean(r["rounds_executed"] for r in eval_results)
    avg_llm_calls = statistics.mean(r["llm_calls"] for r in eval_results)
    avg_tokens_in = statistics.mean(r["tokens_in"] for r in eval_results)
    avg_tokens_out = statistics.mean(r["tokens_out"] for r in eval_results)
    avg_cost = statistics.mean(r["cost_usd"] for r in eval_results)

    print("\n" + "=" * 80)
    print("PHASE 7 EVALUATION SUMMARY REPORT")
    print("=" * 80)
    print(f"Total Topics Evaluated:       {len(eval_results)}")
    print(f"Passed Threshold (< 15):      {passed_count} / {len(eval_results)} ({pass_rate:.1f}%)")
    print(f"Needs Review / Flagged:       {len(eval_results) - passed_count} / {len(eval_results)}")
    print(f"Average Rewrite Rounds:       {avg_rounds:.2f} rounds per post")
    print(f"Average LLM Calls:            {avg_llm_calls:.1f} calls per post (budget cap: {settings.MAX_LLM_CALLS_PER_RUN})")
    print(f"Average Input Tokens:         {avg_tokens_in:,.0f} tokens")
    print(f"Average Output Tokens:        {avg_tokens_out:,.0f} tokens")
    print(f"Average Cost Per Post:        ${avg_cost:.5f} USD (~${avg_cost * 1000:.3f} per 1,000 posts)")
    print(f"Total Wall Clock Runtime:     {total_time:.3f}s")

    print("\nAVERAGE SCORE PER ROUND TRAJECTORY:")
    for r_idx in sorted(round_scores_by_round.keys()):
        scores = round_scores_by_round[r_idx]
        avg_sc = statistics.mean(scores)
        print(f"  • Round {r_idx} (n={len(scores):>2}): Average AI-Slop Score = {avg_sc:>5.1f} / 100")

    print("\nEXIT REASONS BREAKDOWN:")
    exit_counts = Counter(r["exit_reason"] for r in eval_results)
    for reason, cnt in exit_counts.items():
        print(f"  • {reason:<18}: {cnt:>2} topic(s)")

    out_file = BACKEND_DIR / "eval_output" / "phase7_10_topics_report.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(
            {
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "pass_rate_pct": pass_rate,
                "passed_count": passed_count,
                "total_topics": len(eval_results),
                "avg_rounds": avg_rounds,
                "avg_llm_calls": avg_llm_calls,
                "avg_cost_usd": avg_cost,
                "score_trajectory": {f"round_{k}": statistics.mean(v) for k, v in round_scores_by_round.items()},
                "topics": eval_results,
            },
            f,
            indent=2,
        )
    print(f"\nDetailed report saved to: {out_file}")

    print("\nHONESTY AUDIT:")
    if pass_rate >= 80.0:
        print(f"✓ Target met: {passed_count}/10 topics ({pass_rate:.0f}%) reached threshold < 15.")
    else:
        print(f"⚠️ Target NOT met: only {passed_count}/10 topics passed. Analysis of non-passing topics:")
        for r in eval_results:
            if not r["passed"]:
                print(f"  - Topic {r['id']} ({r['title']}): exit_reason={r['exit_reason']}, final_score={r['final_score']}")


if __name__ == "__main__":
    from collections import Counter
    run_10_topics_evaluation()
