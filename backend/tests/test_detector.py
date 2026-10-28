from typing import Any, List
import pytest
from langchain_core.language_models.fake_chat_models import FakeChatModel
from langchain_core.messages import AIMessage

from app.agents.detector import (
    DetectionResult,
    DetectorLLMOutput,
    LLMFinding,
    LLMSubScores,
    evaluate_post,
    verify_and_locate_llm_findings,
)


def test_quote_verification_keeps_exact_and_drops_hallucinations():
    post_text = (
        "PostgreSQL buffer allocation improved dramatically after tuning work_mem to 64MB.\n\n"
        "We observed query execution times drop from 120ms to 18ms on large joins."
    )

    llm_findings = [
        # Exact quote present in text
        LLMFinding(
            category="vocabulary",
            quote="dramatically",
            explanation="Overly sensational adverb",
        ),
        # Phrase present in text
        LLMFinding(
            category="specificity",
            quote="tuning work_mem to 64MB",
            explanation="Specific tuning parameter",
        ),
        # Hallucinated quote NOT present in text
        LLMFinding(
            category="tone",
            quote="In today's fast-paced corporate world",
            explanation="Generic opener not in post",
        ),
        # Invented quote NOT in text
        LLMFinding(
            category="structure",
            quote="The secret is simple:",
            explanation="Colon reveal hallucinated by LLM",
        ),
    ]

    verified = verify_and_locate_llm_findings(post_text, llm_findings)

    # Exactly 2 should survive, 2 should be dropped
    assert len(verified) == 2

    # Verify both surviving quotes have exact character offsets
    for vf in verified:
        assert post_text[vf.start : vf.end] == vf.quote

    quotes = [vf.quote for vf in verified]
    assert "dramatically" in quotes
    assert "tuning work_mem to 64MB" in quotes
    assert "In today's fast-paced corporate world" not in quotes
    assert "The secret is simple:" not in quotes


from langchain_core.runnables import RunnableLambda


class MockDetectorChatModel(FakeChatModel):
    structured_response: Any = None

    def with_structured_output(self, schema, **kwargs):
        resp = self.structured_response
        return RunnableLambda(lambda x: {"parsed": resp, "raw": AIMessage(content="mock")})


def test_evaluate_post_combines_deterministic_and_llm():
    post_text = (
        "PostgreSQL 16 introduced bidirectionally linked memory contexts.\n\n"
        "In our benchmarks with 400 active client connections, memory fragmentation fell from 34% to 12% over 48 hours. "
        "The p99 query latency stayed flat at 18ms under 5,000 queries per second.\n\n"
        "We deployed the upgrade across our staging cluster last Tuesday, monitoring buffer pool evictions. "
        "The database service remained stable throughout the test."
    )

    fake_output = DetectorLLMOutput(
        sub_scores=LLMSubScores(
            vocabulary=10,
            structure=10,
            rhythm=10,
            specificity=5,
            tone=10,
        ),
        llm_score=10,
        findings=[
            LLMFinding(
                category="specificity",
                quote="bidirectionally linked memory contexts",
                explanation="Grounded technical parameter",
            ),
        ],
    )

    fake_model = MockDetectorChatModel(structured_response=fake_output)
    result = evaluate_post(post_text, model=fake_model, threshold=15)

    assert result.deterministic_score == 0
    assert result.llm_score == 10
    assert result.final_score == 10  # max(0, 10)
    assert result.passed is True
    assert len(result.findings) == 1
    assert result.findings[0].quote == "bidirectionally linked memory contexts"


def test_evaluate_post_fails_when_deterministic_score_exceeds_threshold():
    # Text with heavy deterministic AI slop (delve, robust, transformative, etc.)
    post_text = (
        "In today's fast-paced world, we must delve into this robust framework to leverage transformative synergies.\n\n"
        "Let that sink in. Agree? Thoughts?"
    )

    fake_output = DetectorLLMOutput(
        sub_scores=LLMSubScores(
            vocabulary=20,
            structure=20,
            rhythm=20,
            specificity=20,
            tone=20,
        ),
        llm_score=20,
        findings=[],
    )

    fake_model = MockDetectorChatModel(structured_response=fake_output)
    result = evaluate_post(post_text, model=fake_model, threshold=15)

    assert result.deterministic_score > 15
    assert result.final_score == max(result.deterministic_score, result.llm_score)
    assert result.passed is False
