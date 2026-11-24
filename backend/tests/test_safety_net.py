"""Phase 3 failure-injection tests for the shared generation safety net and categorized errors."""

import datetime
import sys
import types
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.limiter import enforce_rate_limit
from app.services import pipeline as pipeline_mod
from app.services.pipeline import execute_pipeline
from app.services.resilient_llm import ResilientChatModelWrapper, run_call_with_timeout
from app.services.run_errors import (
    ERROR_CATEGORY_PLAN_EXPIRED,
    ERROR_CATEGORY_QUOTA_REACHED,
    ERROR_CATEGORY_RATE_LIMITED,
    ERROR_CATEGORY_TEMPORARY_PROBLEM,
    MSG_PLAN_EXPIRED,
    MSG_TEMPORARY_PROBLEM,
    format_quota_reached_message,
    format_rate_limited_message,
)
from app.services.search import Candidate


class _DummySearch:
    def search(self, query: str, lookback_days: int = 3, max_results: int = 10):
        return [
            Candidate(
                title="Why Connection Pools Saturate Before CPU",
                url="https://example.com/pools",
                snippet="Pool saturation causes tail latency spikes before CPU hits 50%.",
                published_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            )
        ]


def _base_profile():
    return {
        "role_title": "Staff Engineer",
        "industry": "Software Engineering",
        "niche_description": "Backend reliability and distributed systems",
        "audience": "Engineering leaders",
        "goals": "Share practical production lessons",
        "tone": "direct",
        "topics_include": ["connection pooling"],
        "topics_avoid": [],
    }


def test_run_call_with_timeout_returns_immediately_on_hang():
    import time

    def slow():
        time.sleep(5.0)
        return "late"

    t0 = time.perf_counter()
    with pytest.raises(TimeoutError):
        run_call_with_timeout(slow, timeout_seconds=0.15)
    elapsed = time.perf_counter() - t0
    assert elapsed < 1.0, f"Expected immediate timeout, took {elapsed:.2f}s"


def test_transient_500_and_429_retries_then_succeeds():
    calls = {"n": 0}

    class FakeModel:
        def invoke(self, inp, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("500 Internal Server Error")
            if calls["n"] == 2:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return types.SimpleNamespace(content="A" * 120)

    wrapper = ResilientChatModelWrapper(real_model=FakeModel(), model_name="gemini-3.5-flash-lite", timeout_seconds=5.0)
    with patch("app.services.quota.check_run_budgets_before_call"):
        res = wrapper.invoke("Write a post")
    assert calls["n"] == 3
    assert len(res.content) == 120


def test_invalid_json_and_empty_text_retry_at_most_once():
    # Invalid JSON / parsed=None -> at most 2 attempts (1 initial + 1 retry)
    bad_calls = {"n": 0}

    class BadStructuredModel:
        def with_structured_output(self, schema, include_raw=True, **kwargs):
            class _R:
                def invoke(self_inner, inp):
                    bad_calls["n"] += 1
                    return {"raw": None, "parsed": None, "parsing_error": "Invalid JSON"}
            return _R()

    wrapper = ResilientChatModelWrapper(real_model=BadStructuredModel(), model_name="gemini-3.5-flash-lite", timeout_seconds=5.0)
    with patch("app.services.quota.check_run_budgets_before_call"):
        with pytest.raises(RuntimeError):
            wrapper.with_structured_output(dict).invoke("test")
    assert bad_calls["n"] == 2

    # Empty text -> at most 2 attempts
    empty_calls = {"n": 0}

    class EmptyTextModel:
        def invoke(self, inp, **kwargs):
            empty_calls["n"] += 1
            return types.SimpleNamespace(content="   ")

    wrapper2 = ResilientChatModelWrapper(real_model=EmptyTextModel(), model_name="gemini-3.5-flash-lite", timeout_seconds=5.0)
    with patch("app.services.quota.check_run_budgets_before_call"):
        with pytest.raises(RuntimeError):
            wrapper2.invoke("test")
    assert empty_calls["n"] == 2


@pytest.mark.parametrize("failing_stage", ["plan", "finder", "gtm_brief", "drafter", "detector"])
def test_llm_timeout_in_each_stage_falls_back_to_post_or_categorized_error(failing_stage, monkeypatch):
    # Make plain fallback return a valid post when graph fails
    valid_post = {
        "post_text": "Most teams blame CPU when p99 latency spikes, but connection pool exhaustion hits first. " * 3,
        "hashtags": ["#engineering"],
        "image_headline": "",
        "first_comment": "",
    }

    class _FakeGraph:
        def stream(self, state, config=None, stream_mode="updates"):
            yield {failing_stage: {"error_code": "timed_out", "status": "timed_out", "error_detail": f"Node '{failing_stage}' timed out"}}

    monkeypatch.setattr(pipeline_mod, "build_graph", lambda **kw: _FakeGraph())
    monkeypatch.setattr(pipeline_mod, "_run_plain_fallback_drafter", lambda **kw: valid_post)

    res = execute_pipeline(
        user_id="user-1",
        profile_dict=_base_profile(),
        history=[],
        search_tool=_DummySearch(),
        is_manual=True,
        run_id=str(uuid.uuid4()),
        use_customization=False,
        entry_point="playground",
    )
    assert res["status"] == "succeeded"
    assert res["draft"]["post_text"] == valid_post["post_text"]
    assert res["exit_reason"] == "plain_fallback"

    # Now if plain fallback ALSO fails, must return temporary_problem (never generic old message)
    monkeypatch.setattr(pipeline_mod, "_run_plain_fallback_drafter", lambda **kw: None)
    res_fail = execute_pipeline(
        user_id="user-1",
        profile_dict=_base_profile(),
        history=[],
        search_tool=_DummySearch(),
        is_manual=True,
        run_id=str(uuid.uuid4()),
        use_customization=False,
        entry_point="playground",
    )
    assert res_fail["status"] == "failed_error"
    assert res_fail["error_category"] == ERROR_CATEGORY_TEMPORARY_PROBLEM
    assert res_fail["error_detail"] == MSG_TEMPORARY_PROBLEM


def test_mid_run_failure_preserves_best_candidate_from_earlier_round(monkeypatch):
    good_draft = {
        "post_text": "We cut p99 latency by 40% by shrinking our Postgres connection pool from 100 to 15. " * 3,
        "hashtags": [],
        "image_headline": "",
        "first_comment": "",
    }

    class _FakeGraph:
        def stream(self, state, config=None, stream_mode="updates"):
            yield {"drafter": {"draft": good_draft, "best_clean_draft": good_draft, "best_draft": good_draft}}
            raise RuntimeError("Simulated DB connection error mid-run")

    monkeypatch.setattr(pipeline_mod, "build_graph", lambda **kw: _FakeGraph())

    res = execute_pipeline(
        user_id="user-1",
        profile_dict=_base_profile(),
        history=[],
        search_tool=_DummySearch(),
        is_manual=True,
        run_id=str(uuid.uuid4()),
        use_customization=False,
        entry_point="playground",
    )
    assert res["status"] == "succeeded"
    assert res["draft"]["post_text"] == good_draft["post_text"]


def test_gtm_or_slop_rejects_every_round_still_returns_best_candidate(monkeypatch):
    best_raw = {
        "post_text": "When queues back up behind a slow downstream service, timeouts cascade fast. " * 3,
        "hashtags": [],
        "image_headline": "",
        "first_comment": "",
    }

    class _FakeGraph:
        def stream(self, state, config=None, stream_mode="updates"):
            yield {"router": {"best_raw_draft": best_raw, "best_draft": best_raw, "is_loop_terminal": True, "status": "failed_quality"}}

    monkeypatch.setattr(pipeline_mod, "build_graph", lambda **kw: _FakeGraph())

    res = execute_pipeline(
        user_id="user-1",
        profile_dict=_base_profile(),
        history=[],
        search_tool=_DummySearch(),
        is_manual=True,
        run_id=str(uuid.uuid4()),
        use_customization=False,
        entry_point="playground",
    )
    assert res["status"] == "succeeded"
    assert res["draft"]["post_text"] == best_raw["post_text"]


def test_redis_down_does_not_break_rate_limit_or_locks():
    from app.services.run_lock import acquire_manual_run_lock, release_manual_run_lock
    from app.services.search_cache import get_cached_search, set_cached_search

    with patch("app.core.limiter.get_redis_client", return_value=None), \
         patch("app.services.run_lock.get_redis_client", return_value=None), \
         patch("app.services.search_cache.get_redis_client", return_value=None):
        enforce_rate_limit(f"test-redis-down-{uuid.uuid4()}", max_requests=5, window_seconds=60)
        ok, active = acquire_manual_run_lock("redis-down-user", uuid.uuid4())
        assert ok is True
        assert active is None
        release_manual_run_lock("redis-down-user")
        set_cached_search("redis-down-user", "query", [])
        assert get_cached_search("redis-down-user", "query") == []


def test_categorized_error_messages_and_rate_limit_429():
    assert MSG_PLAN_EXPIRED == "Your plan has ended. Renew to keep generating posts."
    assert format_rate_limited_message(120) == "You are generating too fast. Try again in 2 minutes."
    assert format_rate_limited_message(60) == "You are generating too fast. Try again in 1 minute."
    assert format_quota_reached_message("daily") == "You have used your posts for today. It resets tomorrow."
    assert "You have used your posts for this month." in format_quota_reached_message("monthly")
    assert MSG_TEMPORARY_PROBLEM == "Something went wrong on our side. Your quota was not used. Try again in a minute."

    key = f"rl-test-{uuid.uuid4()}"
    enforce_rate_limit(key, max_requests=1, window_seconds=120)
    with pytest.raises(HTTPException) as exc_info:
        enforce_rate_limit(key, max_requests=1, window_seconds=120)
    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"] == "120"
    assert exc_info.value.detail["error_category"] == ERROR_CATEGORY_RATE_LIMITED
    assert exc_info.value.detail["message"] == "You are generating too fast. Try again in 2 minutes."


def test_failed_run_does_not_reduce_quota():
    from app.services.quota import COUNTED_RUN_STATUSES

    for failed_status in ("failed_error", "failed", "timed_out", "interrupted", "cancelled"):
        assert failed_status not in COUNTED_RUN_STATUSES
