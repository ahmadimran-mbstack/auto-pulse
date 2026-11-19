"""Unit tests for EffectivePolicy, clamping, and parameterized checks/scanner/evaluator."""

from app.agents.scanner import scan
from app.services.candidate_evaluator import check_hard_length, check_hard_similarity, find_unsupported_claim_numbers
from app.services.checks import (
    check_banned_experience_phrases,
    check_banned_phrases_extra,
    check_claims_to_avoid,
    check_emoji_policy,
    check_hashtags,
    check_length_and_hook,
    check_numbers_grounding,
    check_question_ending,
    check_required_end_phrase,
    run_all_checks,
)
from app.services.customization.policy import EffectivePolicy, clamp_policy


def test_default_policy_matches_legacy_bounds():
    p = EffectivePolicy()
    assert p.length_min == 850
    assert p.length_max == 1200
    assert p.first_line_max == 140
    assert p.hashtags_min == 1
    assert p.hashtags_max == 3
    assert p.hashtag_case == "camel"
    assert p.emoji_policy == "none"

    short_text = "Short hook line.\n\n" + ("word " * 50)
    assert check_length_and_hook(short_text) == check_length_and_hook(short_text, policy=p)

    valid_text = "Specific hook under 140 chars.\n\n" + ("Concrete engineering detail. " * 32)
    assert 850 <= len(valid_text.strip()) <= 1200
    assert check_length_and_hook(valid_text) is None
    assert check_length_and_hook(valid_text, policy=p) is None


def test_policy_clamping():
    extreme = EffectivePolicy(
        length_min=50,
        length_max=5000,
        first_line_max=500,
        hashtags_min=0,
        hashtags_max=20,
    )
    clamped, warnings = clamp_policy(extreme)
    assert clamped.length_min == 300
    assert clamped.length_max == 2900
    assert clamped.first_line_max == 210
    assert clamped.hashtags_max == 5
    assert len(warnings) >= 3


def test_custom_length_and_hashtags_policy():
    policy = EffectivePolicy(
        length_min=400,
        length_max=700,
        hashtags_min=0,
        hashtags_max=2,
        hashtag_case="lower",
        provenance={"length_min": "playbook:U1-LEN-01", "length_max": "playbook:U1-LEN-01"},
    )
    text = "Short hook line.\n\n" + ("Practical operational detail. " * 16)
    assert 400 <= len(text.strip()) <= 700
    assert check_length_and_hook(text, policy=policy) is None
    assert check_hard_length(text, policy=policy) is None
    assert check_hashtags([], policy=policy) is None
    assert check_hashtags(["devops", "cloud"], policy=policy) is None
    assert check_hashtags(["DevOps"], policy=policy) is not None


def test_emoji_and_ending_policies():
    no_emoji = EffectivePolicy(emoji_policy="none")
    sparse_emoji = EffectivePolicy(emoji_policy="sparse")
    allowed_emoji = EffectivePolicy(emoji_policy="allowed")

    one_emoji = "Hook line\n\nBody text with one rocket 🚀."
    many_emoji = "Hook 🚀🔥💡✨🎯"
    assert check_emoji_policy(one_emoji, no_emoji) is not None
    assert check_emoji_policy(one_emoji, sparse_emoji) is None
    assert check_emoji_policy(many_emoji, sparse_emoji) is not None
    assert check_emoji_policy(many_emoji, allowed_emoji) is None

    end_policy = EffectivePolicy(required_end_phrase="P.S. Reply if you want the checklist.")
    assert check_required_end_phrase("Body without signoff", end_policy) is not None
    assert check_required_end_phrase("Body\n\nP.S. Reply if you want the checklist.", end_policy) is None

    q_req = EffectivePolicy(question_ending="required")
    q_forb = EffectivePolicy(question_ending="forbidden")
    assert check_question_ending("Statement ending.", q_req) is not None
    assert check_question_ending("How do you handle this?", q_req) is None
    assert check_question_ending("How do you handle this?", q_forb) is not None
    assert check_question_ending("Statement ending.", q_forb) is None


def test_banned_phrases_extra_and_claims_to_avoid():
    p = EffectivePolicy(banned_phrases_extra=["synergy", "disruptive"])
    assert check_banned_phrases_extra("We bring synergy to teams.", p) is not None
    assert check_banned_phrases_extra("We bring clarity to teams.", p) is None
    assert check_claims_to_avoid("We offer guaranteed returns.", ["guaranteed returns"]) is not None


def test_scanner_whitelist():
    text = "We leverage strong architecture to build reliable APIs."
    res_default = scan(text)
    res_whitelisted = scan(text, whitelist_words=["leverage"])
    assert any("leverage" in f.quote.lower() for f in res_default.findings)
    assert not any("leverage" in f.quote.lower() for f in res_whitelisted.findings)


def test_extra_allowed_numbers_and_documented_experiences():
    caption = "We reduced onboarding time by 42% for enterprise teams.\n\nLast week we migrated 300 workspaces."
    assert check_numbers_grounding(caption, source_text="", key_facts=[]) is not None
    assert (
        check_numbers_grounding(
            caption,
            source_text="",
            key_facts=[],
            extra_allowed_numbers=["42%", "300"],
        )
        is None
    )
    assert (
        find_unsupported_claim_numbers(
            caption,
            key_facts=[],
            sources=[],
            extra_allowed_numbers=["42%", "300"],
        )
        == []
    )
    assert check_banned_experience_phrases(caption) is not None
    assert (
        check_banned_experience_phrases(
            caption,
            documented_experiences=[{"text": "Last week we migrated 300 enterprise workspaces in one batch."}],
        )
        is None
    )


def test_hard_similarity_against_samples():
    sample = "One two three four five six seven eight nine ten eleven twelve thirteen fourteen."
    copy = "Intro line.\n\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen."
    assert check_hard_similarity(copy, recent_captions=[], sample_texts=[sample]) is True
    assert check_hard_similarity("Completely different post about caching.", [], sample_texts=[sample]) is False
