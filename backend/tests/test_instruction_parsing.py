import pytest

from app.services.checks import check_emoji_policy, find_emojis, strip_emojis
from app.services.customization.compiler import compile_customization_context
from app.services.customization.distillers import (
    CONFLICT_WARNING,
    distill_custom_instructions_to_policy,
    distill_instructions_heuristic,
)


@pytest.mark.parametrize(
    "phrase",
    [
        "Do not use emojis in any post.",
        "Don't use emojis",
        "No emojis",
        "Never use emojis",
        "Avoid emojis",
        "Without emojis",
        "Emoji-free posts",
        "Do not use any emoji at all",
        "- no emojis please",
        "NO EMOJIS",
    ],
)
def test_emoji_negation_phrases_all_ban_emojis(phrase: str):
    policy = distill_custom_instructions_to_policy(phrase)
    assert policy.emoji_policy == "none"

    heur = distill_instructions_heuristic(phrase)
    emoji_constraints = [c for c in heur.constraints if c.type == "emoji_policy"]
    assert len(emoji_constraints) == 1
    assert emoji_constraints[0].value == "none"


@pytest.mark.parametrize(
    "phrase",
    [
        "Use emojis",
        "Feel free to use emojis",
        "Add emojis to posts",
    ],
)
def test_emoji_positive_phrases_allow_emojis(phrase: str):
    policy = distill_custom_instructions_to_policy(phrase)
    assert policy.emoji_policy == "allowed"

    heur = distill_instructions_heuristic(phrase)
    emoji_constraints = [c for c in heur.constraints if c.type == "emoji_policy"]
    assert len(emoji_constraints) == 1
    assert emoji_constraints[0].value == "allowed"


@pytest.mark.parametrize(
    "phrase,expected_max",
    [
        ("Use at most 2 emojis", 2),
        ("Max 1 emoji", 1),
    ],
)
def test_emoji_limit_phrases(phrase: str, expected_max: int):
    policy = distill_custom_instructions_to_policy(phrase)
    assert policy.emoji_policy == "sparse"
    assert policy.emoji_max_count == expected_max

    heur = distill_instructions_heuristic(phrase)
    emoji_constraints = [c for c in heur.constraints if c.type == "emoji_policy"]
    assert len(emoji_constraints) == 1
    assert emoji_constraints[0].value == "sparse"
    assert emoji_constraints[0].max == expected_max


def test_conflicting_emoji_instructions_use_stricter_rule_and_warn():
    text = "- Use emojis\n- No emojis"
    policy = distill_custom_instructions_to_policy(text)
    assert policy.emoji_policy == "none"
    assert CONFLICT_WARNING in policy.warnings

    heur = distill_instructions_heuristic(text)
    assert CONFLICT_WARNING in heur.warnings


def test_hashtag_and_question_ending_negation():
    for h_phrase in ("Do not use hashtags", "No hashtags", "Don't use hashtags", "Avoid hashtags"):
        p = distill_custom_instructions_to_policy(h_phrase)
        assert p.hashtags_in_body is False
        assert p.hashtags_min == 0
        assert p.hashtags_max == 0

    for q_phrase in ("Don't end with a question", "Do not end with a question", "Never end with a question"):
        p = distill_custom_instructions_to_policy(q_phrase)
        assert p.question_ending == "forbidden"


def test_compiler_uses_default_provenance_when_no_emoji_instruction():
    ctx, _ = compile_customization_context(
        docs=[],
        samples=[],
        facts=[],
        settings_data={"custom_instructions": "Keep posts under 1000 characters."},
    )
    assert ctx.policy.provenance.get("emoji_policy") == "default"


def test_emoji_detection_and_stripping_covers_symbols_zwj_and_variation_selectors():
    sample = "Ship fast 🚀 today ✅ -> 🔥 👨‍👩‍👧‍👦 1️⃣"
    found = find_emojis(sample)
    assert len(found) > 0
    assert check_emoji_policy(sample, {"emoji_policy": "none"}) is not None

    stripped = strip_emojis(sample)
    assert find_emojis(stripped) == []
    assert check_emoji_policy(stripped, {"emoji_policy": "none"}) is None
