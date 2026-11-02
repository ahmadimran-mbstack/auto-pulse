import datetime
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.agents.scanner import get_banned_phrases

logger = logging.getLogger(__name__)

# Extensible banned phrases list loaded dynamically from ai_slop_patterns.yaml
def get_current_banned_phrases() -> List[str]:
    try:
        phrases = get_banned_phrases()
        if phrases:
            return phrases
    except Exception:
        pass
    return [
        "delve",
        "in today's fast-paced world",
        "game-changer",
        "game changer",
        "unlock the power",
        "it's not just",
        "revolutionize",
        "landscape of",
        "navigate the complexities",
        "in the ever-evolving",
    ]

BANNED_PHRASES: List[str] = get_current_banned_phrases()

# Banned invented personal/team experience patterns
BANNED_EXPERIENCE_REGEXES = [
    re.compile(r"\bwe\s+audited\b", re.IGNORECASE),
    re.compile(r"\bour\s+customer\b", re.IGNORECASE),
    re.compile(r"\ba\s+customer\b", re.IGNORECASE),
    re.compile(r"\bcustomer\s+called\s+us\b", re.IGNORECASE),
    re.compile(r"\bcustomer\s+told\s+us\b", re.IGNORECASE),
    re.compile(r"\blast\s+week\s+we\b", re.IGNORECASE),
    re.compile(r"\bin\s+recent\s+audits\b", re.IGNORECASE),
    re.compile(r"\bin\s+recent\s+production\s+audits\b", re.IGNORECASE),
    re.compile(r"\bour\s+team\s+found\b", re.IGNORECASE),
    re.compile(r"\bour\s+production\s+alerts\b", re.IGNORECASE),
    re.compile(r"\bwe\s+decided\s+to\s+completely\s+rethink\b", re.IGNORECASE),
    re.compile(r"\bwe\s+spent\s+three\s+quarters\b", re.IGNORECASE),
    re.compile(r"\bwe\s+spent\s+\d+\s+weeks\b", re.IGNORECASE),
    re.compile(r"\bwe\s+wasted\s+\d+\s+weeks\b", re.IGNORECASE),
    re.compile(r"\bwe\s+found\s+the\s+pattern\b", re.IGNORECASE),
    re.compile(r"\bwe\s+tested\s+it\s+under\s+load\b", re.IGNORECASE),
    re.compile(r"\bhere\s+is\s+why\s+we\s+walked\s+away\b", re.IGNORECASE),
]


def check_caption_structure(caption: str) -> Optional[str]:
    """Check caption length, paragraph count, and first line length."""
    clean_caption = caption.strip()
    length = len(clean_caption)
    if length < 700 or length > 1800:
        return f"Caption length {length} is out of bounds (must be between 700 and 1800 characters)"

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean_caption) if p.strip()]
    if len(paragraphs) < 3:
        return f"Caption has {len(paragraphs)} paragraph(s), but at least 3 paragraphs are required"

    first_line = clean_caption.split("\n")[0].strip()
    if len(first_line) > 140:
        return f"First line length is {len(first_line)} characters, which exceeds the 140-character maximum"

    return None


def check_hashtags_and_urls(caption: str, hashtags: List[str]) -> Optional[str]:
    """Check hashtags count and alphanumeric validity, and verify no URLs in caption."""
    if len(hashtags) > 3:
        return f"Too many hashtags ({len(hashtags)}); maximum allowed is 3"

    for tag in hashtags:
        cleaned_tag = tag.lstrip("#")
        if not re.match(r"^[A-Za-z0-9]+$", cleaned_tag):
            return f"Hashtag '{tag}' contains invalid characters (letters and digits only)"

    if re.search(r"https?://|www\.", caption, re.IGNORECASE):
        return "Caption contains a URL link, but URLs are forbidden in post body"

    return None


def check_banned_phrases(caption: str) -> Optional[str]:
    """Check that no banned cliche phrases appear in the caption."""
    lower_caption = caption.lower()
    phrases = get_current_banned_phrases()
    for phrase in phrases:
        if phrase.lower() in lower_caption:
            return f"Caption contains banned phrase: '{phrase}'"
    return None


def check_placeholders(caption: str, image_headline: str = "") -> Optional[str]:
    """Check that no unfilled template placeholders like '{' or '}' remain in output."""
    if "{" in caption or "}" in caption:
        return "Unfilled placeholder detected in post body: contains '{' or '}'"
    if "{" in image_headline or "}" in image_headline:
        return "Unfilled placeholder detected in image headline: contains '{' or '}'"
    return None


def check_raw_title(caption: str, topic_title: Optional[str]) -> Optional[str]:
    """Check that the post does not contain topic_title or any 6+ word run copied from it."""
    if not topic_title:
        return None

    clean_title = topic_title.strip()
    if len(clean_title) >= 12 and clean_title.lower() in caption.lower():
        return f"Post contains raw source title: '{clean_title}'"

    words = re.findall(r"\b[\w'-]+\b", clean_title)
    if len(words) >= 6:
        lower_caption = caption.lower()
        for i in range(len(words) - 5):
            run_phrase = " ".join(words[i : i + 6]).lower()
            if run_phrase in lower_caption:
                return f"Post contains 6+ word phrase copied from raw title: '{run_phrase}'"
    return None


def check_numbers_grounding(
    caption: str,
    source_text: str = "",
    key_facts: Optional[List[Any]] = None,
) -> Optional[str]:
    """Check that percentages, decimals, and numbers with units appear in key_facts.
    Years 2020-2030 and small structural counts (1-10) are allowed.
    """
    facts_parts = []
    if key_facts:
        for kf in key_facts:
            if isinstance(kf, dict):
                facts_parts.append(kf.get("fact", ""))
            elif hasattr(kf, "fact"):
                facts_parts.append(getattr(kf, "fact", ""))
            else:
                facts_parts.append(str(kf))

    combined_grounding = f"{source_text} {' '.join(facts_parts)}"
    # Normalize grounding text: collapse commas in numbers
    normalized_source = re.sub(r",(\d)", r"\1", combined_grounding).lower()

    # 1. Percentages: e.g. 43%, 78%
    percent_matches = re.findall(r"\b(\d+(?:\.\d+)?)\s*%", caption)
    for raw in percent_matches:
        search_target = f"{raw}%"
        if search_target not in normalized_source and raw not in normalized_source:
            return f"Ungrounded percentage '{raw}%' found in post (must appear in key facts)"

    # 2. Numbers with units: ms, s, seconds, minutes, hours, days, x, $, k, million, billion, audits
    unit_pattern = re.compile(
        r"(\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:ms|s|seconds?|minutes?|hours?|days?|x|k|million|billion|audits?)\b)",
        re.IGNORECASE,
    )
    for match in unit_pattern.finditer(caption):
        token = match.group().strip()
        clean_token = re.sub(r"\s+", "", token.lower())
        # Strip commas
        clean_token = clean_token.replace(",", "")
        digits_only = re.sub(r"[^\d\.]", "", clean_token)
        # Check if the token or digits appear in grounding text
        if clean_token not in normalized_source.replace(" ", "") and digits_only not in normalized_source:
            return f"Ungrounded number with unit '{token}' found in post (must appear in key facts)"

    # 3. Decimals: e.g. 12.5, 0.85
    decimal_matches = re.findall(r"\b\d+\.\d+\b", caption)
    for dec in decimal_matches:
        if dec not in normalized_source:
            return f"Ungrounded decimal '{dec}' found in post (must appear in key facts)"

    # 4. Standalone integers
    raw_digits = re.findall(r"\b\d[\d,]*\b", caption)
    for raw in raw_digits:
        cleaned_num = raw.replace(",", "")
        if not cleaned_num.isdigit():
            continue
        val = int(cleaned_num)

        # 4-digit years 2020 through 2030 are exempt
        if len(cleaned_num) == 4 and 2020 <= val <= 2030:
            continue

        # Small structural counts 1 through 10 are allowed
        if 1 <= val <= 10:
            continue

        # Any other number must appear in the source grounding
        if cleaned_num not in normalized_source:
            return f"Ungrounded number '{raw}' found in post (must appear in key facts)"

    return None


def check_banned_experience_phrases(
    caption: str,
    profile: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Detects banned invented-experience phrases ('we audited', 'our customer', 'last week we', etc.).
    Allows them only if the user's content profile explicitly documents that experience.
    """
    profile_text = ""
    if profile:
        profile_text = " ".join([
            str(profile.get("voice_notes") or ""),
            str(profile.get("goals") or ""),
            str(profile.get("niche_description") or ""),
            str(profile.get("bio") or ""),
        ]).lower()

    for pattern in BANNED_EXPERIENCE_REGEXES:
        match = pattern.search(caption)
        if match:
            phrase = match.group()
            # If the creator profile documents this exact experience, allow it
            if phrase.lower() in profile_text:
                continue
            return f"Banned invented-experience phrase detected: '{phrase}' (not found in creator profile)"

    return None


def check_topic_presence(caption: str, topic_label: Optional[str]) -> Optional[str]:
    """Check that at least one meaningful word from topic_label appears in the post."""
    if not topic_label:
        return None

    stopwords = {
        "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with",
        "is", "it", "of", "by", "from", "about", "into", "your", "our", "their", "this", "that"
    }
    words = [
        w.lower()
        for w in re.findall(r"\b[A-Za-z0-9]{3,}\b", topic_label)
        if w.lower() not in stopwords
    ]
    if not words:
        return None

    lower_caption = caption.lower()
    if not any(w in lower_caption for w in words):
        return f"Topic presence check failed: none of the words from topic_label '{topic_label}' appear in post"

    return None


def get_word_5grams(text_content: str) -> Set[Tuple[str, ...]]:
    words = re.findall(r"[a-z0-9]+", text_content.lower())
    if len(words) < 5:
        return set()
    return {tuple(words[i : i + 5]) for i in range(len(words) - 4)}


def check_repeat_overlap(caption: str, recent_captions: List[str]) -> Optional[str]:
    """Check that word 5-gram overlap with last 14 days of captions is under 40 percent."""
    caption_5grams = get_word_5grams(caption)
    if not caption_5grams:
        return None

    past_5grams: Set[Tuple[str, ...]] = set()
    for past_cap in recent_captions:
        if past_cap:
            past_5grams.update(get_word_5grams(past_cap))

    if not past_5grams:
        return None

    overlap_count = len(caption_5grams.intersection(past_5grams))
    overlap_ratio = overlap_count / len(caption_5grams)
    if overlap_ratio >= 0.40:
        percentage = round(overlap_ratio * 100, 1)
        return f"Caption repeats {percentage}% of 5-grams from recent posts (must be under 40%)"

    return None


def check_image_headline(headline: str) -> Optional[str]:
    """Check image headline word count, character count, quotes, and punctuation."""
    clean_headline = headline.strip()
    words = clean_headline.split()
    if len(words) > 10:
        return f"Image headline has {len(words)} words, exceeding the 10-word limit"

    if len(clean_headline) > 70:
        return f"Image headline length {len(clean_headline)} exceeds 70 characters"

    if '"' in clean_headline or "'" in clean_headline or "“" in clean_headline or "”" in clean_headline:
        return "Image headline must not contain quotation marks"

    if clean_headline.endswith("."):
        return "Image headline must not have a trailing period"

    return None


# Schema for LLM relevance check
class RelevanceCheckOutput(BaseModel):
    passed: bool = Field(description="True if post is fully about the topic and grounded; False otherwise")
    failing_sentence: Optional[str] = Field(default=None, description="The specific failing sentence if any")
    reason: Optional[str] = Field(default=None, description="Concise reason for failure if any")


RELEVANCE_CHECK_SYSTEM_PROMPT = """You are a rigorous editorial fact-checking judge.
Evaluate whether a LinkedIn post matches its assigned topic and remains factually grounded in the provided key facts.

CRITICAL CHECKS:
1. Topic and Angle Alignment: Is the post strictly about the assigned topic_label and angle? If it pivots to an unrelated subject (e.g. database contention when the topic is local LLMs), FAIL.
2. Opening Naturalness: Does the opening line read as natural, grammatically correct English? If it contains awkward pasted titles or fragments, FAIL.
3. Fact Grounding: Does any sentence make an ungrounded factual claim or cite metrics not found in key_facts? If yes, FAIL.

Return passed=True if all checks pass. Otherwise return passed=False, the exact failing sentence, and the reason.
"""

RELEVANCE_CHECK_HUMAN_PROMPT = """Evaluate this post:

# Assigned Topic Label: {topic_label}
# Assigned Angle: {angle}

# Key Facts from Sources:
{key_facts_text}

# Post Text:
<<<POST_TEXT>>>
{post_text}
<<<END_POST_TEXT>>>

Provide your verification verdict.
"""

RELEVANCE_CHECK_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", RELEVANCE_CHECK_SYSTEM_PROMPT),
        ("human", RELEVANCE_CHECK_HUMAN_PROMPT),
    ]
)


def check_relevance_llm(
    caption: str,
    topic_label: str,
    angle: str,
    key_facts: Optional[List[Any]] = None,
    model: Optional[BaseChatModel] = None,
) -> Optional[str]:
    """Runs a single cheap, fast LLM relevance check to verify topic fidelity and factual claims."""
    if model is None:
        return None

    facts_text = "\n".join([
        f"- {kf.get('fact', '') if isinstance(kf, dict) else (getattr(kf, 'fact', '') or str(kf))}"
        for kf in (key_facts or [])
    ]) or "No explicit facts provided."

    prompt_input = {
        "topic_label": topic_label or "Assigned Topic",
        "angle": angle or "General Analysis",
        "key_facts_text": facts_text,
        "post_text": caption,
    }

    try:
        structured_model = model.with_structured_output(RelevanceCheckOutput)
        chain = RELEVANCE_CHECK_PROMPT | structured_model
        res: RelevanceCheckOutput = chain.invoke(prompt_input)
        if not res.passed:
            sentence = res.failing_sentence or "Not specified"
            reason = res.reason or "Post deviates from assigned topic or claims unverified facts"
            return f"Relevance check failed: {reason}. Failing sentence: '{sentence}'"
    except Exception as exc:
        logger.debug(f"Relevance LLM check skipped due to error: {exc}")

    return None


IMAGE_HEADLINE_SYSTEM_PROMPT = """You generate companion image headlines for LinkedIn posts.
CRITICAL RULES:
1. Length: MAXIMUM 10 words, MAXIMUM 70 characters.
2. Plain text only: ZERO quotation marks, NO trailing period.
3. Source Grounding: Summarize the post's core takeaway using ONLY words and concepts supported directly by the post text.
4. NEVER use generic templates or unrelated topics.
"""

IMAGE_HEADLINE_HUMAN_PROMPT = """Generate a punchy companion image headline (<= 10 words, <= 70 chars, no quotes, no period) from this post:

<<<POST_TEXT>>>
{post_text}
<<<END_POST_TEXT>>>
"""

IMAGE_HEADLINE_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", IMAGE_HEADLINE_SYSTEM_PROMPT),
        ("human", IMAGE_HEADLINE_HUMAN_PROMPT),
    ]
)


class HeadlineOutput(BaseModel):
    headline: str = Field(description="Companion image headline of at most 10 words and 70 characters")


def generate_companion_image_headline(
    post_text: str,
    model: Optional[BaseChatModel] = None,
) -> str:
    """Generates the companion image headline AFTER the final post exists,
    from the post's main point (max 10 words, max 70 chars), using only words supported by the post.
    """
    if model is not None:
        try:
            structured_model = model.with_structured_output(HeadlineOutput)
            chain = IMAGE_HEADLINE_PROMPT | structured_model
            res: HeadlineOutput = chain.invoke({"post_text": post_text})
            clean = res.headline.strip().strip("\"'").rstrip(".")
            words = clean.split()[:10]
            candidate = " ".join(words)[:70].strip().rstrip(".")
            if candidate:
                return candidate
        except Exception as exc:
            logger.debug(f"Image headline generation error: {exc}. Using deterministic extraction.")

    # Deterministic fallback: extract first punchy clause or sentence from post text
    first_para = post_text.strip().split("\n\n")[0].strip()
    first_sentence = re.split(r"[.!?\n]", first_para)[0].strip()
    clean_line = re.sub(r"[\"']", "", first_sentence).strip()
    words = clean_line.split()[:8]
    headline = " ".join(words)[:65].strip().rstrip(".")
    if not headline:
        headline = "Key Operational Takeaways"
    return headline


def run_all_checks(
    caption: str,
    hashtags: List[str],
    image_headline: str,
    source_text: str = "",
    recent_captions: Optional[List[str]] = None,
    topic_title: Optional[str] = None,
    topic_label: Optional[str] = None,
    key_facts: Optional[List[Any]] = None,
    profile: Optional[Dict[str, Any]] = None,
    relevance_model: Optional[BaseChatModel] = None,
    angle: Optional[str] = None,
) -> List[str]:
    """Runs all deterministic checks plus the LLM relevance check.
    Returns list of failure messages.
    """
    failures: List[str] = []

    # 1. Structural checks
    res = check_caption_structure(caption)
    if res:
        failures.append(res)

    res = check_hashtags_and_urls(caption, hashtags)
    if res:
        failures.append(res)

    res = check_banned_phrases(caption)
    if res:
        failures.append(res)

    res = check_image_headline(image_headline)
    if res:
        failures.append(res)

    res = check_repeat_overlap(caption, recent_captions or [])
    if res:
        failures.append(res)

    # 2. Placeholder detection
    res = check_placeholders(caption, image_headline)
    if res:
        failures.append(res)

    # 3. Raw title detection
    res = check_raw_title(caption, topic_title)
    if res:
        failures.append(res)

    # 4. Number grounding against key facts
    res = check_numbers_grounding(caption, source_text=source_text, key_facts=key_facts)
    if res:
        failures.append(res)

    # 5. Invented experience phrase detection
    res = check_banned_experience_phrases(caption, profile=profile)
    if res:
        failures.append(res)

    # 6. Topic presence check
    res = check_topic_presence(caption, topic_label)
    if res:
        failures.append(res)

    # 7. LLM relevance check (short, cheap call)
    if relevance_model and topic_label:
        res = check_relevance_llm(
            caption=caption,
            topic_label=topic_label,
            angle=angle or "Technical analysis",
            key_facts=key_facts,
            model=relevance_model,
        )
        if res:
            failures.append(res)

    return failures
