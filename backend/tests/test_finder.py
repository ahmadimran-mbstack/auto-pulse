from typing import Any
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.agents.finder import (
    FinderOutput,
    FinderSource,
    run_finder_agent,
    validate_finder_output,
)


def _make_candidates():
    return [
        {
            "title": "PostgreSQL 17 Logical Replication Failover Benchmarks",
            "url": "https://example.com/pg17-benchmarks",
            "published_at": "2026-10-27T10:00:00Z",
            "text": "PostgreSQL 17 introduces failover control for logical replication slots...",
        },
        {
            "title": "Rust Async Runtimes: Tokio vs smol under 50k Concurrency",
            "url": "https://example.com/rust-tokio-vs-smol",
            "published_at": "2026-10-26T14:30:00Z",
            "text": "We ran continuous 50k TCP client connections against Tokio and smol...",
        },
        {
            "title": "Kafka Partition Rebalancing Latency in Kubernetes",
            "url": "https://example.com/kafka-rebalance-k8s",
            "published_at": "2026-10-25T08:00:00Z",
            "text": "Cooperative sticky assignors reduced consumer stop-the-world pauses...",
        },
    ]


def test_validation_fails_when_format_matches_last_2_posts():
    candidates = _make_candidates()
    history = [
        {"post_format": "observer take", "topic_title": "Old Post 1", "is_last_14_days": True},
        {"post_format": "myth vs reality", "topic_title": "Old Post 2", "is_last_14_days": True},
    ]

    # Finder chooses 'observer take' which was used in post 1
    finder_output = FinderOutput(
        topic="PostgreSQL 17 Replication Benchmarks",
        angle="Why slot failover matters for zero-data-loss architectures",
        post_format="observer take",
        hook_type="specific observation",
        why_now="PG 17 release just dropped last week",
        sources=[FinderSource(title="PostgreSQL 17 Benchmarks", url="https://example.com/pg17-benchmarks")],
        avoided=["Old Post 1"],
    )

    is_valid, violations = validate_finder_output(finder_output, candidates, history)
    assert is_valid is False
    assert any("repeats one of the last 2 posts" in v for v in violations)


def test_validation_fails_when_source_url_repeats_last_14_days():
    candidates = _make_candidates()
    history = [
        {
            "post_format": "build log",
            "topic_title": "PostgreSQL Failover Setup",
            "topic_url": "https://example.com/pg17-benchmarks",
            "is_last_14_days": True,
        },
    ]

    finder_output = FinderOutput(
        topic="PostgreSQL 17 Benchmarks",
        angle="Zero downtime replication",
        post_format="comparison with a verdict",
        hook_type="number-led specific result",
        why_now="Recent benchmarks",
        sources=[FinderSource(title="PG17", url="https://example.com/pg17-benchmarks")],
        avoided=[],
    )

    is_valid, violations = validate_finder_output(finder_output, candidates, history)
    assert is_valid is False
    assert any("already used in a post within the last 14 days" in v for v in violations)


def test_validation_fails_when_source_url_not_in_candidates():
    candidates = _make_candidates()
    history = []

    finder_output = FinderOutput(
        topic="Rust Tokio Benchmarks",
        angle="Why Tokio wins",
        post_format="comparison with a verdict",
        hook_type="number-led specific result",
        why_now="Recent shift",
        # Hallucinated URL not in candidate list
        sources=[FinderSource(title="Invented Source", url="https://hallucinated-source.com/rust")],
        avoided=[],
    )

    is_valid, violations = validate_finder_output(finder_output, candidates, history)
    assert is_valid is False
    assert any("was not in candidate search results" in v for v in violations)


def test_validation_fails_on_high_title_overlap_in_last_14_days():
    candidates = _make_candidates()
    history = [
        {
            "post_format": "build log",
            "topic_title": "PostgreSQL 17 Logical Replication Failover",
            "topic_url": "https://example.com/other-url",
            "is_last_14_days": True,
        },
    ]

    finder_output = FinderOutput(
        topic="PostgreSQL 17 Logical Replication Failover",
        angle="Angle take",
        post_format="news with a take",
        hook_type="specific observation",
        why_now="Recent news",
        sources=[FinderSource(title="Kafka", url="https://example.com/kafka-rebalance-k8s")],
        avoided=[],
    )

    is_valid, violations = validate_finder_output(finder_output, candidates, history)
    assert is_valid is False
    assert any("high title overlap" in v for v in violations)


def test_validation_passes_when_all_rules_satisfied():
    candidates = _make_candidates()
    history = [
        {"post_format": "observer take", "topic_title": "PostgreSQL 16 Memory", "is_last_14_days": True},
        {"post_format": "myth vs reality", "topic_title": "Redis Cluster Pitfalls", "is_last_14_days": True},
    ]

    # Valid output: format differs from last 2 ('news with a take'), fresh candidate URL, no title overlap
    finder_output = FinderOutput(
        topic="Kafka Partition Rebalancing Latency in Kubernetes",
        angle="Why cooperative sticky assignors eliminate stop-the-world pauses",
        post_format="news with a take",
        hook_type="number-led specific result",
        why_now="Kubernetes 1.31 worker node upgrades surfaced this issue",
        sources=[FinderSource(title="Kafka Kubernetes", url="https://example.com/kafka-rebalance-k8s")],
        avoided=["PostgreSQL 16 Memory", "Redis Cluster Pitfalls"],
    )

    is_valid, violations = validate_finder_output(finder_output, candidates, history)
    assert is_valid is True
    assert len(violations) == 0


class MockFinderChatModel(FakeChatModel):
    responses: list

    def with_structured_output(self, schema, **kwargs):
        resp_list = list(self.responses)

        def _invoke(inputs):
            resp = resp_list.pop(0) if resp_list else self.responses[-1]
            return {"parsed": resp, "raw": AIMessage(content="mock")}

        return RunnableLambda(_invoke)


def test_run_finder_agent_retries_on_violation():
    candidates = _make_candidates()
    history = [
        {"post_format": "observer take", "topic_title": "PostgreSQL 16 Memory", "is_last_14_days": True},
        {"post_format": "myth vs reality", "topic_title": "Redis Cluster Pitfalls", "is_last_14_days": True},
    ]

    # First attempt: invalid (uses 'observer take' which was in history[0])
    invalid_resp = FinderOutput(
        topic="Kafka Partition Rebalancing",
        angle="Take",
        post_format="observer take",
        hook_type="specific observation",
        why_now="Now",
        sources=[FinderSource(title="Kafka", url="https://example.com/kafka-rebalance-k8s")],
        avoided=[],
    )

    # Second attempt: corrected (uses 'build log')
    valid_resp = FinderOutput(
        topic="Kafka Partition Rebalancing",
        angle="Take",
        post_format="build log",
        hook_type="specific observation",
        why_now="Now",
        sources=[FinderSource(title="Kafka", url="https://example.com/kafka-rebalance-k8s")],
        avoided=[],
    )

    mock_model = MockFinderChatModel(responses=[invalid_resp, valid_resp])
    profile = {
        "role_title": "Backend Architect",
        "industry": "Distributed Systems",
        "niche_description": "Data pipelines and high-throughput queuing",
        "audience": "Staff Engineers",
    }

    result, warnings = run_finder_agent(profile, candidates, history, model=mock_model)
    assert result is not None
    assert result.post_format == "build log"
    assert len(warnings) == 1
    assert "repeats one of the last 2 posts" in warnings[0]
