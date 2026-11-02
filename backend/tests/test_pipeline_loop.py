import datetime
from typing import Any, Dict, List, Optional
import uuid
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.agents.detector import DetectionResult, DetectorLLMOutput, LLMFinding, LLMSubScores
from app.agents.drafter import DrafterOutput
from app.agents.finder import FinderOutput, FinderSource, KeyFact
from app.agents.gtm import GTMBriefOutput, GTMReviewOutput
from app.core.config import settings
from app.services.checks import RelevanceCheckOutput
from app.services.pipeline import build_graph, execute_pipeline
from app.services.search import Candidate


class MockStructuredChatModel(FakeChatModel):
    responses: list = []
    default_response: Any = None
    call_count: int = 0

    def with_structured_output(self, schema, **kwargs):
        def _invoke(prompt_val):
            self.call_count += 1
            if getattr(schema, "__name__", "") == "RelevanceCheckOutput":
                return RelevanceCheckOutput(
                    passed=True,
                    swap_test_passed=True,
                    all_claims_grounded=True,
                    first_line_natural=True,
                    unsupported_sentences=[],
                    reason="Passes swap test and grounded in facts",
                )
            if self.responses and self.call_count <= len(self.responses):
                resp = self.responses[self.call_count - 1]
            else:
                resp = self.default_response
            return {"parsed": resp, "raw": AIMessage(content="mock")}

        return RunnableLambda(_invoke)


class MockSearchAdapter:
    def __init__(self, candidates: List[Candidate]):
        self.candidates = candidates

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10) -> List[Candidate]:
        return self.candidates


def _make_candidate(idx: int = 1) -> Candidate:
    fact_sent_1 = f"PostgreSQL 16 dropped buffer locks by 42% in recent high-concurrency benchmarks under active traffic load {idx}."
    fact_sent_2 = f"In production workloads running over 400 active client connections, latency fell from 120ms to 18ms across all instances."
    fact_sent_3 = f"Shared buffer cache hits improved by 35% across all tested memory configurations during high-throughput queries."
    filler = (
        "Database performance tuning requires careful measurement of shared memory contention and lock wait states. "
        "When concurrent update transactions saturate buffer pins, worker threads queue for shared buffer pool locks. "
        "Modern relational engines isolate read operations using atomic memory primitives and lightweight lock manager locks. "
        "In enterprise deployments with large connection counts, lock contention often degrades query response times. "
        "Evaluating database workloads under realistic synthetic load allows engineering teams to identify query stalls. "
        "Recent architectural enhancements in database storage engines address buffer pool scalability and memory bandwidth. "
        "Throughput benchmarks demonstrate that avoiding shared lock queues improves throughput for latency-sensitive services. "
        "Careful capacity planning and database configuration benchmarking prevent unnecessary hardware over-provisioning."
    )
    full_text = f"{fact_sent_1} {fact_sent_2} {fact_sent_3} {filler} {filler}"
    return Candidate(
        title=f"PostgreSQL 16 Performance Audit Under High Concurrency {idx}",
        url=f"https://engineering.postgresql.org/pg16-audit-{idx}",
        text=full_text,
        published_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        source_name="PostgreSQL Engineering",
    )


def _make_finder_resp(cand: Candidate) -> FinderOutput:
    return FinderOutput(
        topic_title=cand.title,
        topic_label="PostgreSQL lock scaling",
        angle="Benchmark results demonstrate reduced lock contention under high concurrency.",
        post_format="observer take",
        hook_type="number-led specific result",
        why_now="Recent benchmarks",
        sources=[FinderSource(title=cand.title, url=cand.url)],
        key_facts=[
            KeyFact(
                fact="PostgreSQL 16 dropped buffer locks by 42% in recent high-concurrency benchmarks.",
                evidence_quote="PostgreSQL 16 dropped buffer locks by 42% in recent high-concurrency benchmarks under active traffic load",
                source_url=cand.url,
            ),
            KeyFact(
                fact="In production workloads running over 400 active client connections, latency fell from 120ms to 18ms.",
                evidence_quote="In production workloads running over 400 active client connections, latency fell from 120ms to 18ms across all instances.",
                source_url=cand.url,
            ),
            KeyFact(
                fact="Shared buffer cache hits improved by 35% across all tested memory configurations.",
                evidence_quote="Shared buffer cache hits improved by 35% across all tested memory configurations during high-throughput queries.",
                source_url=cand.url,
            ),
        ],
    )


_CLEAN_CAPTION = (
    "PostgreSQL 16 dropped buffer locks by 42% in recent high-concurrency benchmarks.\n\n"
    "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
    "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
    "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
    "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
    "In our synthetic load tests, query latency fell from 120ms to 18ms without requiring index rebuilds or sharding. "
    "Shared buffer cache hits improved by 35% across all tested memory configurations.\n\n"
    "Engineers evaluating PostgreSQL lock scaling should monitor buffer lock pressure before adding hardware. "
    "Measuring lock contention under synthetic load provides actionable data for infrastructure sizing."
)


def test_loop_terminates_immediately_when_initial_score_below_threshold():
    """Initial draft scores 5 (< 15 threshold), loop should terminate at round 0 with 'passed'."""
    cand = _make_candidate(1)
    search_adapter = MockSearchAdapter([cand])
    finder_resp = _make_finder_resp(cand)

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close [END-01].",
        notes=["[HOOK-01] Valid opening."],
    )

    drafter_resp = DrafterOutput(
        post_text=_CLEAN_CAPTION,
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    detector_resp = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=5, structure=5, rhythm=5, specificity=5, tone=5),
        llm_score=5,
        findings=[],
    )

    gtm_review_resp = GTMReviewOutput(
        hook_strength=9,
        review_notes=["Strong opening hook [HOOK-01]", "Clean close [END-01]"],
    )

    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["query 1", "query 2", "query 3"]}),
        "finder": MockStructuredChatModel(default_response=finder_resp),
        "gtm_brief": MockStructuredChatModel(default_response=gtm_brief_resp),
        "gtm_review": MockStructuredChatModel(default_response=gtm_review_resp),
        "drafter": MockStructuredChatModel(default_response=drafter_resp),
        "detector": MockStructuredChatModel(default_response=detector_resp),
    }

    final_state = execute_pipeline(
        user_id="user_test_1",
        profile_dict={"role_title": "Database Engineer"},
        history=[],
        search_tool=search_adapter,
        models=models,
    )

    assert final_state.get("error_code") is None
    assert final_state.get("round") == 0
    assert final_state.get("needs_review") is False
    assert final_state.get("ai_score") <= 15
    trace = final_state.get("agent_trace", {})
    assert trace.get("exit_reason") == "passed"
    assert trace.get("best_round") == 0
    assert len(trace.get("rounds", [])) == 1


def test_loop_terminates_on_two_strikes():
    """Rewrite fails to improve score by >= 3 points twice in a row; terminates on 2 strikes."""
    cand = _make_candidate(2)
    search_adapter = MockSearchAdapter([cand])
    finder_resp = _make_finder_resp(cand)

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    drafter_resp = DrafterOutput(
        post_text=_CLEAN_CAPTION,
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    # Round 0: score 50
    # Round 1: score 49 (improved by 1 < 3 -> strike 1)
    # Round 2: score 48 (improved by 1 < 3 -> strike 2 -> terminal exit)
    detector_r0 = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=50, structure=50, rhythm=50, specificity=50, tone=50),
        llm_score=50,
        findings=[LLMFinding(category="vocabulary", quote="high concurrency", explanation="Generic term")],
    )
    detector_r1 = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=49, structure=49, rhythm=49, specificity=49, tone=49),
        llm_score=49,
        findings=[LLMFinding(category="vocabulary", quote="high concurrency", explanation="Generic term")],
    )
    detector_r2 = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=48, structure=48, rhythm=48, specificity=48, tone=48),
        llm_score=48,
        findings=[LLMFinding(category="vocabulary", quote="high concurrency", explanation="Generic term")],
    )

    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["q1", "q2", "q3"]}),
        "finder": MockStructuredChatModel(default_response=finder_resp),
        "gtm": MockStructuredChatModel(default_response=gtm_brief_resp),
        "drafter": MockStructuredChatModel(default_response=drafter_resp),
        "detector": MockStructuredChatModel(responses=[detector_r0, detector_r1, detector_r2]),
    }

    final_state = execute_pipeline(
        user_id="user_test_2",
        profile_dict={"role_title": "Database Engineer"},
        history=[],
        search_tool=search_adapter,
        models=models,
    )

    trace = final_state.get("agent_trace", {})
    assert trace.get("exit_reason") == "no_improvement"
    assert final_state.get("needs_review") is True
    # Best draft chosen was round 2 with score 48
    assert final_state.get("ai_score") == 48
    assert trace.get("best_round") == 2
    assert len(trace.get("rounds", [])) == 3


def test_loop_terminates_on_max_rounds():
    """Rounds continue until MAX_REWRITE_ROUNDS (3) reached; selects lowest score draft and flags needs_review."""
    cand = _make_candidate(3)
    search_adapter = MockSearchAdapter([cand])
    finder_resp = _make_finder_resp(cand)

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    drafter_resp = DrafterOutput(
        post_text=_CLEAN_CAPTION,
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    # 4 rounds: r0=40, r1=35 (improved by 5), r2=30 (improved by 5), r3=25 (improved by 5, but max rounds reached)
    def _make_det(sc):
        return DetectorLLMOutput(
            sub_scores=LLMSubScores(vocabulary=sc, structure=sc, rhythm=sc, specificity=sc, tone=sc),
            llm_score=sc,
            findings=[LLMFinding(category="vocabulary", quote="Logical replication", explanation="term")],
        )

    detector_model = MockStructuredChatModel(
        responses=[_make_det(40), _make_det(35), _make_det(30), _make_det(25)]
    )

    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["q1", "q2", "q3"]}),
        "finder": MockStructuredChatModel(default_response=finder_resp),
        "gtm": MockStructuredChatModel(default_response=gtm_brief_resp),
        "drafter": MockStructuredChatModel(default_response=drafter_resp),
        "detector": detector_model,
    }

    final_state = execute_pipeline(
        user_id="user_test_3",
        profile_dict={"role_title": "Database Engineer"},
        history=[],
        search_tool=search_adapter,
        models=models,
    )

    trace = final_state.get("agent_trace", {})
    assert trace.get("exit_reason") == "max_rounds"
    assert final_state.get("needs_review") is True
    # Lowest score was 25
    assert final_state.get("ai_score") == 25
    assert trace.get("best_round") == 3
    assert len(trace.get("rounds", [])) == 4


def test_step_callback_reports_progress():
    """Validates that step_callback receives every step and round during execution."""
    cand = _make_candidate(4)
    search_adapter = MockSearchAdapter([cand])
    finder_resp = _make_finder_resp(cand)

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    drafter_resp = DrafterOutput(
        post_text=_CLEAN_CAPTION,
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Latency Benchmark",
    )

    detector_resp = DetectorLLMOutput(
        sub_scores=LLMSubScores(vocabulary=10, structure=10, rhythm=10, specificity=10, tone=10),
        llm_score=10,
        findings=[],
    )

    models = {
        "fast": MockStructuredChatModel(default_response={"queries": ["q1", "q2", "q3"]}),
        "finder": MockStructuredChatModel(default_response=finder_resp),
        "gtm": MockStructuredChatModel(default_response=gtm_brief_resp),
        "drafter": MockStructuredChatModel(default_response=drafter_resp),
        "detector": MockStructuredChatModel(default_response=detector_resp),
    }

    reported_steps = []

    def _on_step(step_name, round_num, state):
        reported_steps.append((step_name, round_num))

    final_state = execute_pipeline(
        user_id="user_test_4",
        profile_dict={"role_title": "Database Engineer"},
        history=[],
        search_tool=search_adapter,
        models=models,
        step_callback=_on_step,
    )

    step_names = [s[0] for s in reported_steps]
    assert "plan" in step_names
    assert "search" in step_names
    assert "finder" in step_names
    assert "gtm_brief" in step_names
    assert "drafter" in step_names
    assert "detector" in step_names
    assert "check" in step_names
    assert "post_loop" in step_names
    assert "completed" in step_names
