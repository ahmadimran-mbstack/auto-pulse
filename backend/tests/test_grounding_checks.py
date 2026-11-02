import re
import pytest

from app.agents.finder import KeyFact, clean_topic_label
from app.agents.knowledge.hook_library import (
    HOOK_LIBRARY,
    HOOK_STYLES,
    get_available_hook_styles,
    normalize_hook_style,
)
from app.services.checks import (
    check_banned_experience_phrases,
    check_numbers_grounding,
    check_placeholders,
    check_raw_title,
    check_topic_presence,
    generate_companion_image_headline,
    run_all_checks,
)


# =====================================================================
# 1. PLACEHOLDER DETECTION
# =====================================================================

def test_placeholder_detection():
    """Verify that curly braces '{' or '}' in caption or image headline are caught."""
    # Caption with unfilled placeholder
    caption_with_placeholder = "Why {topic} is taking over modern engineering teams."
    res = check_placeholders(caption_with_placeholder, "Normal Headline")
    assert res is not None
    assert "Unfilled placeholder" in res

    # Image headline with unfilled placeholder
    headline_with_placeholder = "Why {topic} Matters"
    res2 = check_placeholders("Normal clean caption without braces.", headline_with_placeholder)
    assert res2 is not None
    assert "Unfilled placeholder" in res2

    # Clean caption and headline
    clean_res = check_placeholders("A clean post without any template braces.", "Clean Headline")
    assert clean_res is None


# =====================================================================
# 2. RAW TITLE DETECTION
# =====================================================================

def test_raw_title_exact_match():
    """Verify that exact title match in caption is detected."""
    raw_title = "Best Local LLMs in 2026 for Production Benchmarks"
    caption = f"Here is why {raw_title} is critical for teams today."
    res = check_raw_title(caption, raw_title)
    assert res is not None
    assert "Post contains raw source title" in res


def test_raw_title_6_word_run_match():
    """Verify that a 6+ word run copied from raw title is detected."""
    raw_title = "Best Local LLMs October 2026 Benchmarks Memory Usage And Latency"
    # 6-word run: "October 2026 Benchmarks Memory Usage And"
    caption = "We evaluated the October 2026 Benchmarks Memory Usage And found improvements."
    res = check_raw_title(caption, raw_title)
    assert res is not None
    assert "word phrase copied from raw title" in res


def test_raw_title_no_overlap():
    """Natural paraphrasing without 6-word verbatim runs passes."""
    raw_title = "Best Local LLMs October 2026 Benchmarks Memory Usage And Latency"
    caption = "Local models have reached impressive speeds on consumer hardware."
    res = check_raw_title(caption, raw_title)
    assert res is None


# =====================================================================
# 3. NUMBER GROUNDING
# =====================================================================

def test_number_grounding_grounded_number_passes():
    """Numbers that appear in key_facts pass validation."""
    key_facts = [
        KeyFact(fact="Model response time dropped to 12ms under load.", source_url="https://example.com"),
        KeyFact(fact="Throughput increased by 42% on 8-bit quantized models.", source_url="https://example.com"),
    ]
    caption = "Engineers observed response time dropping to 12ms, while throughput improved by 42%."
    res = check_numbers_grounding(caption, key_facts=key_facts)
    assert res is None


def test_number_grounding_ungrounded_unit_fails():
    """'450ms' with no source fact must fail."""
    key_facts = [
        KeyFact(fact="Latency dropped significantly in latest benchmarks.", source_url="https://example.com"),
    ]
    caption = "Query latency fell from 450ms down to 12ms without cache layers."
    res = check_numbers_grounding(caption, key_facts=key_facts)
    assert res is not None
    assert "450ms" in res


def test_number_grounding_ungrounded_percentage_fails():
    """Invented percentages like 43% or 78% fail if not in key facts."""
    key_facts = [
        KeyFact(fact="Throughput improved under high concurrency.", source_url="https://example.com"),
    ]
    caption = "Failure rates dropped by 43% across all worker pools."
    res = check_numbers_grounding(caption, key_facts=key_facts)
    assert res is not None
    assert "43%" in res


def test_number_grounding_exempt_years_and_structural_counts():
    """Years 2020 to 2030 and structural counts 1 to 10 pass without being in facts."""
    key_facts = []
    # 2026 is an exempt year, 3 is an exempt structural count
    caption = "In 2026, teams follow 3 steps to optimize local runtime memory."
    res = check_numbers_grounding(caption, key_facts=key_facts)
    assert res is None


# =====================================================================
# 4. INVENTED-EXPERIENCE PHRASE DETECTION
# =====================================================================

def test_invented_experience_detection_fails():
    """Phrases claiming personal/team audits or customer events fail by default."""
    banned_captions = [
        "In recent production audits, we discovered heavy memory leakage.",
        "A customer called us last week asking about lock contention.",
        "Last week we migrated 50 nodes to the new architecture.",
        "Our team found several issues in the default configuration.",
        "We audited 30 enterprise deployments and found consistent bloat.",
    ]
    for cap in banned_captions:
        res = check_banned_experience_phrases(cap, profile=None)
        assert res is not None, f"Expected violation for caption: {cap}"
        assert "invented-experience phrase" in res.lower()


def test_invented_experience_allowed_when_in_profile():
    """If the user's content profile explicitly documents the experience, it passes."""
    profile = {
        "bio": "Principal SRE conducting weekly production audits for enterprise clients.",
        "voice_notes": "We audited multiple legacy systems last quarter.",
    }
    caption = "When we audited these systems, we discovered persistent lock contention."
    res = check_banned_experience_phrases(caption, profile=profile)
    assert res is None


# =====================================================================
# 5. TOPIC PRESENCE
# =====================================================================

def test_topic_presence_passes():
    """Meaningful word from topic_label present in post passes."""
    topic_label = "Local LLMs"
    caption = "Running small models locally gives developers complete control over data privacy."
    res = check_topic_presence(caption, topic_label)
    assert res is None


def test_topic_presence_fails():
    """Post that completely ignores the topic fails."""
    topic_label = "Local LLMs"
    caption = "PostgreSQL lock contention causes major query delays under high client concurrency."
    res = check_topic_presence(caption, topic_label)
    assert res is not None
    assert "Topic presence check failed" in res


# =====================================================================
# 6. TOPIC LABEL CLEANING (NO MID-WORD CUTTING)
# =====================================================================

def test_clean_topic_label_does_not_cut_mid_word():
    """clean_topic_label extracts 2-6 whole words and never truncates mid-word."""
    raw_title = "Best Local LLMs (October 2026): Benchmarks, Memory & Won't Melt Your RAM"
    label = clean_topic_label(raw_title)

    # Must be 2 to 6 words
    words = label.split()
    assert 2 <= len(words) <= 6
    # Must NOT cut mid-word (like 'Wo')
    assert "Wo" not in words
    assert not label.endswith("Wo")
    # Must contain full words
    assert all(len(w) >= 2 for w in words)
    assert label == "Best Local LLMs October 2026" or "Local LLMs" in label


def test_clean_topic_label_short_title():
    """Short title becomes a clean 2-6 word phrase."""
    raw_title = "SQLite Vector Search"
    label = clean_topic_label(raw_title)
    assert label == "SQLite Vector Search"
    assert len(label.split()) == 3


# =====================================================================
# 7. HOOK LIBRARY VALIDATION
# =====================================================================

def test_hook_library_no_placeholders_and_valid_schema():
    """Verify HOOK_LIBRARY contains no '{' template braces, no digit%, no typo, and adheres to schema."""
    assert len(HOOK_LIBRARY) >= 28

    for hook in HOOK_LIBRARY:
        hook_id = hook.get("id")
        # Schema checks
        assert "id" in hook, f"Hook missing 'id': {hook}"
        assert "style" in hook, f"Hook {hook_id} missing 'style'"
        assert "name" in hook, f"Hook {hook_id} missing 'name'"
        assert "pattern" in hook, f"Hook {hook_id} missing 'pattern'"
        assert "examples" in hook, f"Hook {hook_id} missing 'examples'"
        assert "avoid" in hook, f"Hook {hook_id} missing 'avoid'"

        # No template field
        assert "template" not in hook, f"Hook {hook_id} must not have 'template' field"

        # No '{' or '}' in pattern, examples, avoid
        assert "{" not in hook["pattern"], f"Hook {hook_id} pattern has '{{'"
        assert "}" not in hook["pattern"], f"Hook {hook_id} pattern has '}}'"

        for ex in hook["examples"]:
            assert "{" not in ex, f"Hook {hook_id} example has '{{': {ex}"
            assert "}" not in ex, f"Hook {hook_id} example has '}}': {ex}"
            # No ungrounded percentages in examples (digit followed by %)
            assert not re.search(r"\d+%", ex), f"Hook {hook_id} example has digit%: {ex}"

        # Exactly 2 examples
        assert len(hook["examples"]) == 2, f"Hook {hook_id} must have exactly 2 examples"

        # Typo check: "will bit you" must not be present
        full_text = f"{hook['name']} {hook['pattern']} {' '.join(hook['examples'])} {hook['avoid']}"
        assert "will bit you" not in full_text.lower(), f"Hook {hook_id} contains typo 'will bit you'"

        # No infra/backend-specific jargon hardcoded in generic hook rules
        for infra_jargon in ["p99", "pods", "network partitions", "mttr"]:
            assert infra_jargon not in hook["pattern"].lower(), (
                f"Hook {hook_id} contains niche-specific infra jargon '{infra_jargon}'"
            )


# =====================================================================
# 8. COMPANION IMAGE HEADLINE
# =====================================================================

def test_companion_image_headline_generation():
    """Image headline is derived from post text, <= 10 words, no quotes, no period."""
    post_text = (
        "Running local LLMs gives small engineering teams privacy and cost predictability.\n\n"
        "By utilizing 8-bit quantized weights, developers run inference directly on consumer workstations. "
        "This eliminates API egress fees and guarantees data never leaves local boundaries."
    )
    headline = generate_companion_image_headline(post_text)
    assert headline is not None
    assert len(headline.split()) <= 10
    assert len(headline) <= 70
    assert not headline.endswith(".")
    assert '"' not in headline and "'" not in headline
    # Headline uses words supported by the post
    lower_post = post_text.lower()
    headline_words = [w.lower() for w in re.findall(r"\b[A-Za-z0-9]+\b", headline)]
    supported = sum(1 for w in headline_words if w in lower_post or w in ["local", "llms"])
    assert supported >= len(headline_words) * 0.7
