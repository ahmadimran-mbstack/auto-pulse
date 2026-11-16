"""Phase 7 verification suite for the AutoPulse live agent pipeline and API routes."""

import datetime
from typing import Any, List
import uuid
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda
from sqlalchemy import text

from app.agents.detector import DetectorLLMOutput, LLMSubScores
from app.agents.drafter import DrafterOutput
from app.agents.finder import FinderOutput, FinderSource, KeyFact
from app.agents.gtm import GTMBriefOutput
from app.core import auth
from app.db.session import get_db
from app.main import app
from app.models.post import PlaygroundRun, Post, RunEvent
from app.models.profile import Profile
from app.services.candidate_evaluator import (
    CandidateJudgeOutput,
    RepairOutput,
    evaluate_candidate,
)
from app.services.pipeline import execute_pipeline
from app.services.pipeline_config import PLAIN_TECH_ERROR_MESSAGE
from app.services.prompts import PlanOutput
from app.services.run_events import RunEventEmitter
from app.services.search import Candidate
from tests.conftest import create_test_token


class SeqMockModel(FakeChatModel):
    """Mock chat model returning schema-matched responses in order or via handler."""

    handler: Any = None

    def with_structured_output(self, schema, **kwargs):
        def _invoke(prompt_val):
            name = getattr(schema, "__name__", "")
            resp = self.handler(name, prompt_val)
            return {"parsed": resp, "raw": AIMessage(content="ok")}

        return RunnableLambda(_invoke)


class StaticSearch:
    def __init__(self, candidates: List[Candidate]):
        self.candidates = candidates

    def search(self, query: str, lookback_days: int = 3, max_results: int = 10) -> List[Candidate]:
        return self.candidates


def _sample_candidates() -> List[Candidate]:
    text_1 = (
        "PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients. "
        "Latency dropped from 120ms to 18ms under heavy write load across primary replicas. "
        "Shared buffer cache hit rates rose by 35% when using atomic pin primitives. "
    ) * 8
    text_2 = (
        "Redis 7.4 added hash field expiration with 28% lower memory overhead in multi-tenant caches. "
        "Teams running 500 shards saw p99 read latency stabilize at 4ms during peak traffic. "
        "Background eviction threads avoid blocking the main event loop during key sweeps. "
    ) * 8
    return [
        Candidate(
            title="PostgreSQL 16 Buffer Lock Benchmarks Under Load",
            url="https://engineering.postgresql.org/pg16-locks",
            text=text_1,
            published_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            source_name="PostgreSQL Engineering",
        ),
        Candidate(
            title="Redis 7.4 Hash Expiration Memory Study",
            url="https://redis.io/blog/redis-74-hash-ttl",
            text=text_2,
            published_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            source_name="Redis Blog",
        ),
    ]


def _clean_post_body(topic_word: str = "PostgreSQL 16") -> str:
    return (
        f"{topic_word} changed how high-throughput teams handle buffer contention.\n\n"
        "When 400 clients hit the same shared page concurrently, lock queues stall before CPU ever maxes out. "
        "Shifting buffer pin acquisition to atomic primitives cut p99 latency from 120ms to 18ms in benchmarks.\n\n"
        "Most teams scale instance size first when they should measure lock wait states instead. "
        "Check pg_stat_activity wait events before upgrading hardware.\n\n"
        "What wait event surprises your team most under peak load?"
    )


def _base_profile() -> dict:
    return {
        "user_id": "u-test",
        "role_title": "Staff Infrastructure Engineer",
        "industry": "Database Systems",
        "niche_description": "PostgreSQL internals and production reliability",
        "audience": "Backend engineers and SREs",
        "goals": "Share practical engineering lessons",
        "tone": "direct",
        "topics_include": ["PostgreSQL", "Caching"],
        "topics_avoid": ["crypto"],
    }


def test_case1_generic_hook_never_fails_and_emits_plain_note():
    """Case 1: GTM returning a generic hook never throws; pipeline finishes with a clean draft."""
    cands = _sample_candidates()

    def _handle(schema_name: str, _prompt: Any):
        if schema_name == "PlanOutput":
            return PlanOutput(queries=["postgres locks", "redis ttl", "db latency"])
        if schema_name == "FinderOutput":
            return FinderOutput(
                topic_title=cands[0].title,
                topic_label="PostgreSQL lock scaling",
                angle="Atomic buffer pins remove lock queues before CPU saturates.",
                key_facts=[
                    KeyFact(
                        fact="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        evidence_quote="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        source_url=cands[0].url,
                    )
                ],
                post_format="observer take",
                hook_type="specific observation",
                why_now="New benchmark data",
                sources=[FinderSource(title=cands[0].title, url=cands[0].url)],
            )
        if schema_name == "GTMBriefOutput":
            return GTMBriefOutput(
                hook_style="observation",
                hook_id="obs_1",
                hook_text="Something significant is shifting in database performance.",
                structure_lines=["Hook", "Problem", "Fix", "Question"],
                ending_strategy="Practitioner question",
            )
        if schema_name == "DrafterOutput":
            return DrafterOutput(
                post_text=_clean_post_body("PostgreSQL 16"),
                hashtags=["postgres", "databases"],
                image_headline="Buffer Locks Cut By 42%",
            )
        if schema_name == "DetectorLLMOutput":
            return DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=5, structure=5, rhythm=5, specificity=5, tone=5),
                llm_score=8,
                findings=[],
            )
        if schema_name == "CandidateJudgeOutput":
            return CandidateJudgeOutput(hook_strength=22, relevance=23, fact_grounding=18, critique="")
        return None

    m = SeqMockModel(handler=_handle)
    res = execute_pipeline(
        user_id="u-test",
        profile_dict=_base_profile(),
        history=[],
        search_tool=StaticSearch(cands),
        models={"fast": m, "finder": m, "gtm": m, "drafter": m, "detector": m},
        is_manual=True,
    )
    assert res["status"] == "succeeded"
    assert res["draft"]["post_text"]
    assert not res.get("error_code")


def test_case2_raw_topic_pasted_never_returned():
    """Case 2: A post whose first line is the raw topic title pasted unchanged is never returned."""
    cands = _sample_candidates()

    def _handle(schema_name: str, _prompt: Any):
        if schema_name == "PlanOutput":
            return PlanOutput(queries=["postgres locks", "redis ttl", "db latency"])
        if schema_name == "FinderOutput":
            return FinderOutput(
                topic_title=cands[0].title,
                topic_label="PostgreSQL lock scaling",
                angle="Buffer pins",
                key_facts=[
                    KeyFact(
                        fact="PostgreSQL 16 cut buffer lock contention by 42%.",
                        evidence_quote="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        source_url=cands[0].url,
                    )
                ],
                post_format="observer take",
                hook_type="specific observation",
                why_now="Now",
                sources=[FinderSource(title=cands[0].title, url=cands[0].url)],
            )
        if schema_name == "GTMBriefOutput":
            return GTMBriefOutput(hook_style="observation", hook_id="obs_1", hook_text=cands[0].title)
        if schema_name == "DrafterOutput":
            # Always paste raw topic title on line 1
            return DrafterOutput(
                post_text=f"{cands[0].title}\n\n" + _clean_post_body("PostgreSQL 16"),
                hashtags=["postgres"],
                image_headline="Locks",
            )
        if schema_name == "DetectorLLMOutput":
            return DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=5, structure=5, rhythm=5, specificity=5, tone=5),
                llm_score=8,
                findings=[],
            )
        if schema_name == "CandidateJudgeOutput":
            return CandidateJudgeOutput(hook_strength=20, relevance=20, fact_grounding=18, critique="")
        return None

    m = SeqMockModel(handler=_handle)
    res = execute_pipeline(
        user_id="u-test",
        profile_dict=_base_profile(),
        history=[],
        search_tool=StaticSearch(cands),
        models={"fast": m, "finder": m, "gtm": m, "drafter": m, "detector": m},
        is_manual=True,
    )
    assert res["draft"] is None
    assert res["status"] == "failed_error"
    assert res["error_detail"] == PLAIN_TECH_ERROR_MESSAGE


def test_case3_invented_stat_caught_and_repaired():
    """Case 3: Invented statistic triggers unsupported_number hard check and repair removes it."""
    cands = _sample_candidates()
    clean_text = _clean_post_body("PostgreSQL 16")

    def _handle(schema_name: str, _prompt: Any):
        if schema_name == "PlanOutput":
            return PlanOutput(queries=["postgres locks", "redis ttl", "db latency"])
        if schema_name == "FinderOutput":
            return FinderOutput(
                topic_title=cands[0].title,
                topic_label="PostgreSQL lock scaling",
                angle="Atomic buffer pins",
                key_facts=[
                    KeyFact(
                        fact="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        evidence_quote="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        source_url=cands[0].url,
                    )
                ],
                post_format="observer take",
                hook_type="specific observation",
                why_now="Now",
                sources=[FinderSource(title=cands[0].title, url=cands[0].url)],
            )
        if schema_name == "GTMBriefOutput":
            return GTMBriefOutput(hook_style="observation", hook_id="obs_1", hook_text="Lock queues stall before CPU.")
        if schema_name == "DrafterOutput":
            # Invent 91% and $45000 not in facts
            return DrafterOutput(
                post_text=clean_text + "\n\nIn fact, 91% of teams waste $45000 every quarter on oversized nodes.",
                hashtags=["postgres"],
                image_headline="Buffer Locks",
            )
        if schema_name == "DetectorLLMOutput":
            return DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=5, structure=5, rhythm=5, specificity=5, tone=5),
                llm_score=8,
                findings=[],
            )
        if schema_name == "CandidateJudgeOutput":
            return CandidateJudgeOutput(hook_strength=20, relevance=22, fact_grounding=18, critique="")
        if schema_name == "RepairOutput":
            return RepairOutput(post_text=clean_text)
        return None

    m = SeqMockModel(handler=_handle)
    res = execute_pipeline(
        user_id="u-test",
        profile_dict=_base_profile(),
        history=[],
        search_tool=StaticSearch(cands),
        models={"fast": m, "finder": m, "gtm": m, "drafter": m, "detector": m},
        is_manual=True,
    )
    assert res["status"] == "succeeded"
    assert "91%" not in res["draft"]["post_text"]
    assert "$45000" not in res["draft"]["post_text"]


def test_case4_relevant_slop14_beats_offtopic_slop7():
    """Case 4: Slop 7 off-topic loses to slop 14 relevant post in evaluate_candidate."""
    ctx_base = {
        "profile": _base_profile(),
        "key_facts": [{"fact": "PostgreSQL 16 cut buffer locks by 42%."}],
        "topic_title": "PostgreSQL 16 Benchmarks",
        "topic_label": "PostgreSQL lock scaling",
        "history": [],
    }
    offtopic_judge = SeqMockModel(
        handler=lambda s, _: CandidateJudgeOutput(hook_strength=18, relevance=4, fact_grounding=6, critique="Off topic")
    )
    relevant_judge = SeqMockModel(
        handler=lambda s, _: CandidateJudgeOutput(hook_strength=22, relevance=24, fact_grounding=19, critique="")
    )
    post = _clean_post_body("PostgreSQL 16")
    eval_off = evaluate_candidate({"post_text": post}, {**ctx_base, "ai_slop_score": 7}, judge_model=offtopic_judge)
    eval_rel = evaluate_candidate({"post_text": post}, {**ctx_base, "ai_slop_score": 14}, judge_model=relevant_judge)
    assert eval_rel.score > eval_off.score


def test_case5_time_budget_returns_best_so_far(monkeypatch):
    """Case 5: When TIME_BUDGET_SECONDS is reached after round 1, best clean draft is returned."""
    import app.services.pipeline as pipeline_mod
    monkeypatch.setattr(pipeline_mod, "TIME_BUDGET_SECONDS", 0)
    cands = _sample_candidates()

    def _handle(schema_name: str, _prompt: Any):
        if schema_name == "PlanOutput":
            return PlanOutput(queries=["postgres locks", "redis ttl", "db latency"])
        if schema_name == "FinderOutput":
            return FinderOutput(
                topic_title=cands[0].title,
                topic_label="PostgreSQL lock scaling",
                angle="Atomic pins",
                key_facts=[
                    KeyFact(
                        fact="PostgreSQL 16 cut buffer lock contention by 42%.",
                        evidence_quote="PostgreSQL 16 cut buffer lock contention by 42% in benchmarks running 400 concurrent clients.",
                        source_url=cands[0].url,
                    )
                ],
                post_format="observer take",
                hook_type="specific observation",
                why_now="Now",
                sources=[FinderSource(title=cands[0].title, url=cands[0].url)],
            )
        if schema_name == "GTMBriefOutput":
            return GTMBriefOutput(hook_style="observation", hook_id="obs_1", hook_text="Lock queues stall before CPU.")
        if schema_name == "DrafterOutput":
            return DrafterOutput(post_text=_clean_post_body("PostgreSQL 16"), hashtags=["postgres"], image_headline="Locks")
        if schema_name == "DetectorLLMOutput":
            return DetectorLLMOutput(
                sub_scores=LLMSubScores(vocabulary=10, structure=10, rhythm=10, specificity=10, tone=10),
                llm_score=22,
                findings=[],
            )
        if schema_name == "CandidateJudgeOutput":
            return CandidateJudgeOutput(hook_strength=18, relevance=18, fact_grounding=16, critique="Sharpen")
        return None

    m = SeqMockModel(handler=_handle)
    res = execute_pipeline(
        user_id="u-test",
        profile_dict=_base_profile(),
        history=[],
        search_tool=StaticSearch(cands),
        models={"fast": m, "finder": m, "gtm": m, "drafter": m, "detector": m},
        is_manual=True,
    )
    assert res["status"] == "succeeded"
    assert res["draft"]["post_text"] == _clean_post_body("PostgreSQL 16")
    assert res["internal_trace"]["stop_reason"] == "time_budget"


def test_case6_provider_timeout_returns_plain_message():
    """Case 6: Provider timeout returns plain message with no stack trace."""
    class TimeoutModel(FakeChatModel):
        def with_structured_output(self, schema, **kwargs):
            def _invoke(_p):
                raise TimeoutError("Model provider timed out after 30s")
            return RunnableLambda(_invoke)

    m = TimeoutModel()
    cands = _sample_candidates()
    res = execute_pipeline(
        user_id="u-test",
        profile_dict=_base_profile(),
        history=[],
        search_tool=StaticSearch(cands),
        models={"fast": m, "finder": m, "gtm": m, "drafter": m, "detector": m},
        is_manual=True,
    )
    assert res["status"] == "failed_error"
    assert res["error_detail"] == PLAIN_TECH_ERROR_MESSAGE
    assert "Traceback" not in res["error_detail"]


def test_cases_8_9_11_12_13_14_routes_security_and_lifecycle(client, db_test_schema, ed25519_keys, monkeypatch):
    """Cases 8, 9, 11, 12, 13, 14: Double-click dedup, refresh/events, 404 ownership,
    no internal data leak, 2-min stuck-run failure, and cancel with clean best draft.
    """
    private_key, jwks = ed25519_keys
    monkeypatch.setattr(auth, "_fetch_jwks", lambda *args, **kwargs: jwks)

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]

    def _override_db():
        with SessionLocal() as db:
            db.execute(text(f'SET search_path TO "{schema_name}"'))
            yield db

    app.dependency_overrides[get_db] = _override_db
    monkeypatch.setattr("app.api.routes.playground.SessionLocal", SessionLocal)
    # Do not run background task synchronously during POST test
    monkeypatch.setattr("app.api.routes.playground.run_playground_pipeline_task", lambda *a, **kw: None)

    token_a = create_test_token(private_key, sub="user-A")
    token_b = create_test_token(private_key, sub="user-B")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    try:
        # Case 8: Double click on POST /playground/runs returns the same run_id
        r1 = client.post("/playground/runs", json={"topic_hint": "Postgres"}, headers=headers_a)
        r2 = client.post("/playground/runs", json={"topic_hint": "Postgres"}, headers=headers_a)
        assert r1.status_code == 202
        assert r2.status_code == 202
        run_id = r1.json()["run_id"]
        assert r2.json()["run_id"] == run_id

        # Seed events & private internal_trace for run_id
        with SessionLocal() as db:
            db.execute(text(f'SET search_path TO "{schema_name}"'))
            run_row = db.query(PlaygroundRun).filter(PlaygroundRun.id == uuid.UUID(run_id)).first()
            run_row.status = "running"
            run_row.best_draft = {"post_text": _clean_post_body("PostgreSQL 16"), "hashtags": ["pg"], "image_headline": "Locks"}
            run_row.internal_trace = {
                "combined_score": 55,
                "below_target": True,
                "secret_prompt": "SYSTEM PROMPT",
            }
            db.add(
                RunEvent(
                    run_id=uuid.UUID(run_id),
                    user_id="user-A",
                    seq=1,
                    type="run_started",
                    status="working",
                    message="Starting your post writing run.",
                    payload={},
                )
            )
            db.add(
                RunEvent(
                    run_id=uuid.UUID(run_id),
                    user_id="user-A",
                    seq=2,
                    type="hook_chosen",
                    agent="Hook strategist",
                    status="done",
                    message="Chosen opening style: observation.",
                    payload={"hook_style": "observation"},
                )
            )
            db.commit()

        # Case 9: Refresh / cursor polling returns events cleanly
        ev_all = client.get(f"/playground/runs/{run_id}/events?after_seq=0", headers=headers_a)
        assert ev_all.status_code == 200
        assert len(ev_all.json()["events"]) == 2
        assert ev_all.json()["last_seq"] == 2

        ev_inc = client.get(f"/playground/runs/{run_id}/events?after_seq=2", headers=headers_a)
        assert ev_inc.status_code == 200
        assert ev_inc.json()["events"] == []

        # Case 11: User B gets 404 on User A's run and events
        assert client.get(f"/playground/runs/{run_id}", headers=headers_b).status_code == 404
        assert client.get(f"/playground/runs/{run_id}/events", headers=headers_b).status_code == 404

        # Case 12: Public API responses never contain internal_trace, prompts, or below_target
        run_detail_text = client.get(f"/playground/runs/{run_id}", headers=headers_a).text
        events_text = ev_all.text
        for blob in (run_detail_text, events_text):
            assert "internal_trace" not in blob
            assert "below_target" not in blob
            assert "combined_score" not in blob
            assert "SYSTEM PROMPT" not in blob

        # Case 14: Cancel mid-run preserves clean best_draft
        cancel_res = client.post(f"/playground/runs/{run_id}/cancel", headers=headers_a)
        assert cancel_res.status_code == 200
        assert cancel_res.json()["status"] == "cancelled"
        assert cancel_res.json()["best_draft"]["post_text"]

        # Case 13: Stuck run after 2-minute silence marks failed with plain message
        with SessionLocal() as db:
            db.execute(text(f'SET search_path TO "{schema_name}"'))
            run_row = db.query(PlaygroundRun).filter(PlaygroundRun.id == uuid.UUID(run_id)).first()
            run_row.status = "running"
            run_row.last_progress_at = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=130)
            db.commit()

        stuck_ev = client.get(f"/playground/runs/{run_id}/events?after_seq=2", headers=headers_a)
        assert stuck_ev.status_code == 200
        assert stuck_ev.json()["status"] == "failed_error"
        assert stuck_ev.json()["events"][-1]["type"] == "run_failed"
        assert stuck_ev.json()["events"][-1]["message"] == PLAIN_TECH_ERROR_MESSAGE
    finally:
        app.dependency_overrides.pop(get_db, None)
