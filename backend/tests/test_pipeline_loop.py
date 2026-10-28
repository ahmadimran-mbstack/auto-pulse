from typing import Any, Dict, List, Optional
import uuid
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.agents.detector import DetectionResult, DetectorLLMOutput, LLMFinding, LLMSubScores
from app.agents.drafter import DrafterOutput
from app.agents.finder import FinderOutput, FinderSource
from app.agents.gtm import GTMBriefOutput, GTMReviewOutput
from app.core.config import settings
from app.services.pipeline import build_graph, execute_pipeline
from app.services.search import Candidate


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


class MockSearchAdapter:
    def __init__(self, candidates: List[Candidate]):
        self.candidates = candidates

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10) -> List[Candidate]:
        return self.candidates


def _make_candidate(idx: int = 1) -> Candidate:
    return Candidate(
        title=f"PostgreSQL 16 Performance Audit #{idx}",
        url=f"https://example.com/pg16-audit-{idx}",
        text=(
            f"PostgreSQL 16 benchmark results show 42% latency reduction under 400 active client connections. "
            f"In synthetic load tests, latency fell from 120ms to 18ms under concurrent load #{idx}."
        ),
        published_at="2026-10-28T10:00:00Z",
        source_name="DB Weekly",
    )


def test_loop_terminates_immediately_when_initial_score_below_threshold():
    """Initial draft scores 5 (< 15 threshold), loop should terminate at round 0 with 'passed'."""
    cand = _make_candidate(1)
    search_adapter = MockSearchAdapter([cand])

    finder_resp = FinderOutput(
        topic="PostgreSQL 16 Performance Audit",
        angle="Benchmark results",
        post_format="observer take",
        hook_type="number-led specific result",
        why_now="Recent benchmarks",
        sources=[FinderSource(title=cand.title, url=cand.url)],
    )

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer locks by 42%.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close [END-01].",
        notes=["[HOOK-01] Valid opening."],
    )

    clean_caption = (
        "PostgreSQL 16 dropped buffer locks by 42% in recent high-concurrency benchmarks.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "Benchmark buffer pool saturation before approving compute upgrades."
    )

    drafter_resp = DrafterOutput(
        post_text=clean_caption,
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

    finder_resp = FinderOutput(
        topic="Database Index Optimization",
        angle="B-Tree bloat",
        post_format="mistake and fix",
        hook_type="concrete mistake",
        why_now="Production latency spikes",
        sources=[FinderSource(title=cand.title, url=cand.url)],
    )

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="Why index bloat silently kills database throughput.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    caption_text = (
        "Why index bloat silently kills database throughput under high concurrency.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "Benchmark buffer pool saturation before approving compute upgrades."
    )

    drafter_resp = DrafterOutput(
        post_text=caption_text,
        hashtags=["PostgreSQL"],
        image_headline="Index Bloat Fixes",
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

    finder_resp = FinderOutput(
        topic="PostgreSQL Replication",
        angle="Slot failover",
        post_format="build log",
        hook_type="specific observation",
        why_now="Recent failover tests",
        sources=[FinderSource(title=cand.title, url=cand.url)],
    )

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="Logical replication slot failover in PG 17.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    caption_text = (
        "Logical replication slot failover in PG 17 dropped replica promotion delay to 12ms.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "Benchmark buffer pool saturation before approving compute upgrades."
    )

    drafter_resp = DrafterOutput(
        post_text=caption_text,
        hashtags=["PostgreSQL"],
        image_headline="PG 17 Failover Benchmarks",
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

    finder_resp = FinderOutput(
        topic="Topic",
        angle="Angle",
        post_format="observer take",
        hook_type="specific observation",
        why_now="Now",
        sources=[FinderSource(title=cand.title, url=cand.url)],
    )

    gtm_brief_resp = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="Hook line for progress test.",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Decisive close.",
        notes=["[HOOK-01] Valid opening."],
    )

    caption_text = (
        "Hook line for progress test above the fold.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "Benchmark buffer pool saturation before approving compute upgrades."
    )

    drafter_resp = DrafterOutput(
        post_text=caption_text,
        hashtags=["PostgreSQL"],
        image_headline="Headline",
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
