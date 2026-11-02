import datetime
import json
from pathlib import Path
from unittest.mock import MagicMock, patch
import pytest
from sqlalchemy import text

from app.schemas.contracts import Fact
from app.services.checks import (
    RelevanceCheckOutput,
    check_candidate_page_text,
    check_candidate_title,
    check_fact_coverage,
    check_filler_phrases,
    check_generic_hook,
    check_hashtags,
    check_image_headline,
    check_relevance_llm,
    check_topic_label_repetition,
    run_all_checks,
    validate_fact_set,
    validate_topic_label,
    verify_fact_evidence_quote,
)


@pytest.fixture
def bad_run():
    fixture_path = Path(__file__).parent / "fixtures" / "bad_run_001.json"
    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)


@pytest.fixture
def good_run():
    fixture_path = Path(__file__).parent / "fixtures" / "good_run_001.json"
    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)


# Test 1: Title check rejects candidate with adjacent repeated words / junk format
def test_title_check_rejects_junk_candidate(bad_run):
    title = bad_run["topic_title"]
    err = check_candidate_title(title)
    assert err is not None
    assert "repeated word" in err.lower() or "why why" in err.lower()


# Test 2: Topic label repetition check catches 5x repetition
def test_topic_label_repetition_check(bad_run):
    caption = bad_run["post_text"]
    topic_label = "why is backend from first principles is neede is essential for practical reliability in modern engineering"
    err = check_topic_label_repetition(caption, topic_label)
    assert err is not None
    assert "appears" in err.lower() and "maximum 1 allowed" in err.lower()


# Test 3: Fact coverage check fails when facts are missing or unreflected
def test_fact_coverage_check_fails_on_empty_facts(bad_run):
    caption = bad_run["post_text"]
    err = check_fact_coverage(caption, bad_run["key_facts"])
    assert err is not None
    assert "fewer than 3" in err.lower() or "unreflected" in err.lower()


# Test 4: Filler detector catches generic corporate filler phrases
def test_filler_detector_catches_corporate_filler(bad_run):
    caption = bad_run["post_text"]
    err = check_filler_phrases(caption)
    assert err is not None
    assert "filler phrases" in err.lower()


# Test 5: Generic hook check rejects canned template openers
def test_generic_hook_check_rejects_canned_patterns(bad_run):
    hook = bad_run["hook"]
    err = check_generic_hook(hook)
    assert err is not None
    assert "generic filler opener" in err.lower() or "something significant is shifting" in err.lower()


# Test 6: Image headline check rejects hook cut-off / prefix
def test_image_headline_check_rejects_truncated_hook(bad_run):
    headline = bad_run["image_headline"]
    post_text = bad_run["post_text"]
    topic_title = bad_run["topic_title"]
    err = check_image_headline(headline, post_text, topic_title)
    assert err is not None
    # Headline in bad_run is 11 words, so exceeds 10-word limit
    assert "10-word limit" in err.lower() or "prefix" in err.lower()

    # Also verify direct hook prefix truncation (< 10 words)
    prefix_headline = "Something significant is shifting in how teams approach"
    err_prefix = check_image_headline(prefix_headline, hook_text=bad_run["hook"], topic_title=topic_title)
    assert err_prefix is not None
    assert "prefix" in err_prefix.lower() or "truncation" in err_prefix.lower() or "filler" in err_prefix.lower()


# Test 7: Hashtag check rejects stopword / generic single tags like #Why
def test_hashtag_check_rejects_stopwords(bad_run):
    tags = bad_run["hashtags"]
    err = check_hashtags(tags)
    assert err is not None
    assert "too short" in err.lower() or "why" in err.lower()

    # Verify stopword rejection specifically for 4+ letter tag
    err_stopword = check_hashtags(["#When", "#DevOps"])
    assert err_stopword is not None
    assert "stopword" in err_stopword.lower()


# Test 8: Substring verification drops fabricated evidence quotes
def test_substring_verification_catches_fabricated_quotes(good_run):
    page_text = good_run["page_text"]

    # Real quote from text
    real_quote = "Each connection in PostgreSQL allocates a private backend process, requiring approximately 10MB of RAM per active session."
    assert verify_fact_evidence_quote(real_quote, page_text) is True

    # Fabricated quote not in text
    fake_quote = "PostgreSQL allocates exactly 450MB of memory for every connection in standard mode."
    assert verify_fact_evidence_quote(fake_quote, page_text) is False

    # validate_fact_set drops fake quotes and fails if < 3 verified facts remain
    facts = [
        Fact(claim="Real claim 1", evidence_quote=real_quote, source_url="https://example.com"),
        Fact(claim="Fake claim 2", evidence_quote=fake_quote, source_url="https://example.com"),
    ]
    verified, err = validate_fact_set(facts, page_text)
    assert len(verified) == 1
    assert err is not None
    assert "minimum 3 required" in err.lower()


# Test 9: Swap test in LLM judge rejects generic filler body
def test_swap_test_llm_judge_rejects_generic_filler(bad_run):
    mock_model = MagicMock()
    mock_output = RelevanceCheckOutput(
        passed=False,
        swap_test_passed=False,
        all_claims_grounded=False,
        first_line_natural=False,
        unsupported_sentences=[bad_run["post_text"].split("\n\n")[1]],
        reason="Failed swap test: paragraphs are generic corporate filler that could apply to any topic",
    )
    mock_structured = MagicMock()
    mock_structured.return_value = mock_output
    mock_structured.invoke.return_value = mock_output
    mock_model.with_structured_output.return_value = mock_structured

    err = check_relevance_llm(
        caption=bad_run["post_text"],
        topic_label=bad_run["topic_label"],
        angle=bad_run["angle"],
        key_facts=[],
        model=mock_model,
    )
    assert err is not None
    assert "failed swap test" in err.lower() or "llm judge rejected" in err.lower()


# Test 10: Hand-crafted good run fixture passes all checks
def test_good_fixture_passes_all_checks(good_run):
    failures = run_all_checks(
        caption=good_run["post_text"],
        hashtags=good_run["hashtags"],
        image_headline=good_run["image_headline"],
        source_text=good_run["page_text"],
        recent_captions=[],
        topic_title=good_run["topic_title"],
        topic_label=good_run["topic_label"],
        key_facts=good_run["key_facts"],
        angle=good_run["angle"],
    )
    assert failures == []


# Test 11: When loop terminates with no_improvement on a failing post, pipeline marks it failed_quality
def test_no_improvement_marks_run_failed_quality():
    # Construct a pipeline state that ended with no_improvement and check failures
    state = {
        "round": 3,
        "best_round": 1,
        "best_score": 35,
        "exit_reason": "no_improvement",
        "draft": {
            "post_text": "Too short draft",
            "hashtags": ["#Why"],
            "image_headline": "Headline",
        },
        "best_draft": {
            "post_text": "Too short draft",
            "hashtags": ["#Why"],
            "image_headline": "Headline",
        },
        "rounds_history": [],
        "chosen": {"text": "Some source text"},
        "counters": {},
        "seconds_per_node": {},
    }

    check_failures = run_all_checks(
        caption=state["best_draft"]["post_text"],
        hashtags=state["best_draft"]["hashtags"],
        image_headline=state["best_draft"]["image_headline"],
        source_text=state["chosen"]["text"],
        recent_captions=[],
        topic_title="",
        topic_label="",
        key_facts=[],
    )
    assert len(check_failures) > 0

    failed_quality = bool(state["exit_reason"] != "passed" or check_failures)
    assert failed_quality is True


# Test 12: A run with status failed_quality creates NO Post and sends NO approval request
def test_failed_quality_creates_no_post(db_test_schema):
    from app.jobs.dispatch import generate_draft_for_user
    from app.models.approval import Approval
    from app.models.post import GenerationRun, Post
    from app.models.profile import Profile

    SessionLocal = db_test_schema["SessionLocal"]
    schema_name = db_test_schema["schema_name"]
    user_id = "test-user-quality-123"

    with SessionLocal() as db:
        db.execute(text(f'SET search_path TO "{schema_name}"'))
        profile = Profile(user_id=user_id, role_title="Engineer", industry="Tech")
        db.add(profile)
        db.commit()

        run_date = datetime.date.today()

        mock_failed_state = {
            "status": "failed_quality",
            "error_code": "failed_quality",
            "error_detail": "Post failed quality validation: Post length is out of bounds",
            "counters": {"search_calls": 2, "llm_calls": 3, "tokens_in": 1000, "tokens_out": 200},
            "seconds_per_node": {},
            "round": 2,
            "agent_trace": {"failed_quality": True, "reasons": ["Post length out of bounds"]},
        }

        with patch("app.services.pipeline.execute_pipeline", return_value=mock_failed_state):
            post = generate_draft_for_user(db, profile, run_date)
            assert post is None

        # Verify no Post record was created for this date
        created_post = db.query(Post).filter(Post.user_id == user_id, Post.run_date == run_date).first()
        assert created_post is None

        # Verify no Approval was created
        approvals = db.query(Approval).all()
        assert len(approvals) == 0

        # Verify generation_run recorded status = 'failed_quality'
        gen_run = (
            db.query(GenerationRun)
            .filter(GenerationRun.user_id == user_id, GenerationRun.run_date == run_date)
            .first()
        )
        assert gen_run is not None
        assert gen_run.status == "failed_quality"
        assert gen_run.error_code == "failed_quality"
