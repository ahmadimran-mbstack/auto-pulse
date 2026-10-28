from typing import Any
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda

from app.agents.detector import VerifiedFinding
from app.agents.drafter import (
    DrafterOutput,
    _clean_hashtags,
    _clean_image_headline,
    _clean_post_text,
    draft_initial_post,
    rewrite_post_spans,
)
from app.agents.gtm import GTMBriefOutput


class MockDrafterChatModel(FakeChatModel):
    structured_response: Any = None
    call_count: int = 0
    responses: list = []

    def with_structured_output(self, schema, **kwargs):
        def _invoke(prompt_val):
            self.call_count += 1
            if self.responses and self.call_count <= len(self.responses):
                resp = self.responses[self.call_count - 1]
            else:
                resp = self.structured_response
            return {"parsed": resp, "raw": AIMessage(content="mock")}

        return RunnableLambda(_invoke)


def test_clean_helpers():
    # Markdown stripping and arrow replacement
    raw_text = (
        "# Architectural Update\n\n"
        "We tested **PostgreSQL 16** with *extreme* workloads.\n"
        "Key observation: → Buffer locks dropped by 42% — without regressions."
    )
    cleaned = _clean_post_text(raw_text)
    assert "**" not in cleaned
    assert "#" not in cleaned
    assert "→" not in cleaned
    assert "-" in cleaned
    assert "—" not in cleaned

    # Hashtags cleaning
    raw_tags = ["#PostgreSQL", "##Cloud_Ops!", "database", "distributed-systems", "extraTag"]
    cleaned_tags = _clean_hashtags(raw_tags)
    assert len(cleaned_tags) <= 3
    assert cleaned_tags[0] == "PostgreSQL"
    assert cleaned_tags[1] == "CloudOps"
    assert cleaned_tags[2] == "database"

    # Image headline cleaning
    raw_headline = '"Decoupling Storage for Cloud Databases."'
    cleaned_headline = _clean_image_headline(raw_headline)
    assert not cleaned_headline.startswith('"')
    assert not cleaned_headline.endswith('"')
    assert not cleaned_headline.endswith(".")
    assert len(cleaned_headline) <= 70


def test_draft_initial_post_success():
    long_valid_text = (
        "PostgreSQL 16 dropped buffer allocation locks by 42% in recent high-concurrency benchmarks.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "The practical takeaway for database administrators is straightforward: benchmark buffer pool saturation before upgrading instance tiers. "
        "Often, engine-level locking improvements deliver greater throughput gains than simply adding compute capacity."
    )
    assert 700 <= len(long_valid_text) <= 1800

    fake_output = DrafterOutput(
        post_text=long_valid_text,
        hashtags=["PostgreSQL", "DatabaseEngineering", "CloudScale"],
        image_headline="PostgreSQL 16 Benchmark: 42% Lower Lock Latency",
    )

    mock_model = MockDrafterChatModel(structured_response=fake_output)

    brief = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="PostgreSQL 16 dropped buffer allocation locks by 42% in recent high-concurrency benchmarks.",
        structure_lines=["1. Hook", "2. Context", "3. Benchmark", "4. Takeaway"],
        ending_strategy="Decisive technical takeaway without questions.",
        notes=["[HOOK-02] Number-led result"],
    )

    result = draft_initial_post(
        gtm_brief=brief,
        sources=[{"title": "PG16 Benchmarks", "url": "https://example.com", "text": "Detailed test results"}],
        profile={"role_title": "Database Engineer", "tone": "technical, direct"},
        model=mock_model,
    )

    assert result.post_text == long_valid_text
    assert len(result.hashtags) == 3
    assert result.image_headline == "PostgreSQL 16 Benchmark: 42% Lower Lock Latency"
    assert mock_model.call_count == 1


def test_draft_initial_post_retries_on_length_violation():
    short_text = "PostgreSQL 16 is fast. Latency dropped."
    long_valid_text = (
        "PostgreSQL 16 dropped buffer allocation locks by 42% in recent high-concurrency benchmarks.\n\n"
        "In production workloads running over 400 active client connections, memory contention regularly stalls queries. "
        "The legacy engine spent critical CPU cycles coordinating shared buffer pool locks on concurrent updates. "
        "This architectural bottleneck forced teams to over-provision compute nodes to survive traffic surges.\n\n"
        "By introducing atomic buffer pinning and lock-free allocation structures, PostgreSQL 16 keeps active read paths clear. "
        "In our synthetic load tests, p99 query latency fell from 120ms to 18ms without requiring index rebuilds or sharding.\n\n"
        "The practical takeaway for database administrators is straightforward: benchmark buffer pool saturation before upgrading instance tiers."
    )

    attempt1_output = DrafterOutput(
        post_text=short_text,
        hashtags=["PostgreSQL"],
        image_headline="Fast Database",
    )
    attempt2_output = DrafterOutput(
        post_text=long_valid_text,
        hashtags=["PostgreSQL", "DatabaseEngineering"],
        image_headline="PostgreSQL 16 Benchmark Results",
    )

    mock_model = MockDrafterChatModel(responses=[attempt1_output, attempt2_output])

    brief = GTMBriefOutput(
        hook_options=["H1", "H2", "H3"],
        chosen_hook="Hook line",
        structure_lines=["1. A", "2. B", "3. C", "4. D"],
        ending_strategy="Clean close",
        notes=["Notes"],
    )

    result = draft_initial_post(
        gtm_brief=brief,
        model=mock_model,
    )

    assert mock_model.call_count == 2
    assert len(result.post_text) >= 700


def test_rewrite_post_spans_success():
    original_text = (
        "PostgreSQL 16 dropped buffer allocation locks by 42% in recent benchmarks.\n\n"
        "In today's fast-paced world, teams must delve into database performance to supercharge their systems. "
        "The legacy engine spent critical cycles coordinating shared buffer pool locks on updates.\n\n"
        "By introducing atomic buffer pinning, p99 query latency fell from 120ms to 18ms without index rebuilds. "
        "This is a testament to the power of lock-free data structures.\n\n"
        "Thoughts? Agree?"
    )

    revised_text = (
        "PostgreSQL 16 dropped buffer allocation locks by 42% in recent benchmarks.\n\n"
        "Under high-concurrency update patterns, teams must analyze database contention before scaling instance tiers. "
        "The legacy engine spent critical cycles coordinating shared buffer pool locks on updates.\n\n"
        "By introducing atomic buffer pinning, p99 query latency fell from 120ms to 18ms without index rebuilds. "
        "Lock-free memory allocation delivers predictable throughput under bursty workloads.\n\n"
        "Benchmark buffer pool saturation before approving compute upgrades."
    )

    findings = [
        VerifiedFinding(
            source="deterministic",
            rule_id="PHRASE_FAST_PACED_WORLD",
            category="vocabulary",
            message="Banned cliche phrase",
            quote="In today's fast-paced world",
            start=77,
            end=104,
            suggested_fix="Under high-concurrency update patterns",
        ),
        VerifiedFinding(
            source="deterministic",
            rule_id="BANNED_WORD_DELVE",
            category="vocabulary",
            message="Banned strong word",
            quote="delve into",
            start=117,
            end=127,
            suggested_fix="analyze",
        ),
        VerifiedFinding(
            source="deterministic",
            rule_id="BANNED_WORD_TESTAMENT",
            category="vocabulary",
            message="Banned strong word",
            quote="a testament to",
            start=342,
            end=356,
            suggested_fix="Lock-free memory allocation delivers predictable throughput",
        ),
        VerifiedFinding(
            source="deterministic",
            rule_id="STRUCT_ENGAGEMENT_BAIT",
            category="structure",
            message="Engagement bait banned",
            quote="Thoughts? Agree?",
            start=424,
            end=440,
            suggested_fix="Benchmark buffer pool saturation before approving compute upgrades.",
        ),
    ]

    fake_rewrite_output = DrafterOutput(
        post_text=revised_text,
        hashtags=["PostgreSQL", "DatabaseInternals"],
        image_headline="PostgreSQL 16 Lock Optimization",
    )

    mock_model = MockDrafterChatModel(structured_response=fake_rewrite_output)

    result = rewrite_post_spans(
        previous_draft={
            "post_text": original_text,
            "hashtags": ["PostgreSQL", "DatabaseInternals"],
            "image_headline": "PostgreSQL 16 Lock Optimization",
        },
        findings=findings,
        check_failures=["Caption contains banned phrase: 'in today's fast-paced world'"],
        model=mock_model,
    )

    assert "In today's fast-paced world" not in result.post_text
    assert "delve into" not in result.post_text
    assert "Thoughts? Agree?" not in result.post_text
    assert "Under high-concurrency update patterns" in result.post_text
    assert result.image_headline == "PostgreSQL 16 Lock Optimization"
    assert result.hashtags == ["PostgreSQL", "DatabaseInternals"]


def test_rewrite_post_spans_fallback_on_model_error():
    """Validates deterministic substitution fallback when model encounters an exception."""
    class FailingModel(FakeChatModel):
        def with_structured_output(self, schema, **kwargs):
            def _fail(val):
                raise RuntimeError("Service failure")
            return RunnableLambda(_fail)

    original_text = (
        "PostgreSQL 16 dropped locks by 42% in recent production tests.\n\n"
        "We delve into query execution across 400 active client connections to supercharge latency.\n\n"
        "Benchmark your buffer pool before scaling up hardware."
    )

    finding = VerifiedFinding(
        source="deterministic",
        rule_id="BANNED_WORD_DELVE",
        category="vocabulary",
        message="Banned word",
        quote="delve into",
        start=67,
        end=77,
        suggested_fix="examine",
    )

    result = rewrite_post_spans(
        previous_draft={
            "post_text": original_text,
            "hashtags": ["PostgreSQL"],
            "image_headline": "Buffer Pool Scaling",
        },
        findings=[finding],
        model=FailingModel(),
    )

    # Fallback should replace 'delve into' with 'examine'
    assert "delve into" not in result.post_text
    assert "examine" in result.post_text
    assert result.hashtags == ["PostgreSQL"]
    assert result.image_headline == "Buffer Pool Scaling"
