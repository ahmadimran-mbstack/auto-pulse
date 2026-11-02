import datetime
import logging
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from app.agents.scanner import get_banned_phrases
from app.schemas.contracts import Fact

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

# Vague corporate filler phrases that indicate hallucinated or generic content
FILLER_PHRASES: List[str] = [
    "forward-thinking teams",
    "sustainable workflow habits",
    "real-world scenario",
    "something significant is shifting",
    "meaningful trade-offs",
    "steady verification",
    "realistic expectations",
    "clear boundaries",
    "unproven claims",
    "friction almost always emerges",
    "boundaries between tools",
    "when real team adoption begins",
    "unmonitored coordination costs",
    "prioritize predictable execution",
]

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

STOPWORD_TAGS: Set[str] = {
    "why", "the", "how", "new", "what", "and", "for", "with", "from",
    "this", "that", "some", "when", "here", "they", "them", "then",
}


# =====================================================================
# CANDIDATE SOURCING & TITLE CHECKS (STEP 3)
# =====================================================================

def check_candidate_title(title: str) -> Optional[str]:
    """Code checks on every candidate title:
    - Fewer than 5 words: reject.
    - Adjacent repeated words ignoring case ('why why'): reject.
    - Ends mid-word or with a cut-off: reject.
    """
    clean_title = title.strip()
    words = re.findall(r"\b[\w'-]+\b", clean_title)
    if len(words) < 5:
        return f"Candidate title has only {len(words)} words (minimum 5 words required)"

    # Adjacent repeated words (case-insensitive)
    rep_match = re.search(r"\b([A-Za-z]+)\s+\1\b", clean_title, re.IGNORECASE)
    if rep_match:
        repeated_word = rep_match.group(1)
        return f"Candidate title contains adjacent repeated word: '{repeated_word} {repeated_word}'"

    # Ends mid-word or with cut-off
    if re.search(r"[A-Za-z]\.\.\.$", clean_title):
        return "Candidate title ends mid-word with ellipsis"
    if re.search(r"\b(and|or|the|with|to|in|of|&|a|an)\b\s*$", clean_title, re.IGNORECASE):
        return "Candidate title ends with an incomplete connector word"
    if re.search(r"\b[A-Za-z]{1,2}$", clean_title):
        return "Candidate title ends with an incomplete word fragment"
    if clean_title.count("(") != clean_title.count(")"):
        return "Candidate title has unclosed parenthesis"
    if clean_title.count('"') % 2 != 0:
        return "Candidate title has unclosed quotation marks"

    return None


def check_candidate_page_text(text: str) -> Optional[str]:
    """Verifies candidate page text is long enough to extract real facts (minimum 1500 chars)."""
    clean_text = text.strip()
    if len(clean_text) < 1500:
        return f"Candidate page text length is {len(clean_text)} characters (minimum 1500 required)"
    return None


def check_candidate_published_date(published_at: Optional[str], lookback_days: int = 14) -> Optional[str]:
    """Check whether candidate article was published within lookback_days."""
    if not published_at:
        return None
    try:
        clean_str = published_at.replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(clean_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=lookback_days)
        if dt < cutoff:
            return f"Candidate was published on {published_at}, which is older than {lookback_days} days"
    except Exception:
        pass
    return None


def validate_topic_label(topic_label: str) -> Optional[str]:
    """Validates topic_label:
    - 2 to 6 words.
    - No adjacent repeated words.
    - No mid-word cut-offs.
    - Not a single-word or empty string.
    """
    clean = topic_label.strip()
    words = clean.split()
    if len(words) < 2 or len(words) > 6:
        return f"topic_label has {len(words)} words (must be strictly 2 to 6 words)"

    rep_match = re.search(r"\b([A-Za-z]+)\s+\1\b", clean, re.IGNORECASE)
    if rep_match:
        return f"topic_label contains repeated word: '{rep_match.group(1)}'"

    if re.search(r"\b(and|or|the|with|to|in|of|&|a|an)\b\s*$", clean, re.IGNORECASE):
        return "topic_label ends with trailing connector word"

    if re.search(r"\b[A-Za-z]{1}$", clean):
        return "topic_label ends with a single-letter cut-off"

    return None


# =====================================================================
# FACT EXTRACTION & SUBSTRING VERIFICATION (STEP 4)
# =====================================================================

def verify_fact_evidence_quote(evidence_quote: str, page_text: str) -> bool:
    """Verifies that evidence_quote is a real verbatim substring of the fetched page text.
    Normalizes whitespace and case for robust comparison.
    """
    if not evidence_quote or not page_text:
        return False
    norm_quote = re.sub(r"\s+", " ", evidence_quote).strip().lower()
    norm_text = re.sub(r"\s+", " ", page_text).strip().lower()
    return norm_quote in norm_text


def validate_fact_set(facts: List[Any], page_text: str) -> Tuple[List[Fact], Optional[str]]:
    """Filters facts using substring verification, requires at least 3 verified facts,
    and requires at least 1 containing a number or named entity.
    """
    verified: List[Fact] = []
    for f in facts:
        claim = (
            getattr(f, "claim", None)
            or getattr(f, "fact", None)
            or (f.get("claim") if isinstance(f, dict) else None)
            or (f.get("fact") if isinstance(f, dict) else None)
            or str(f)
        )
        quote = f.evidence_quote if hasattr(f, "evidence_quote") else (f.get("evidence_quote") if isinstance(f, dict) else "")
        url = f.source_url if hasattr(f, "source_url") else (f.get("source_url") if isinstance(f, dict) else "")

        if quote and verify_fact_evidence_quote(quote, page_text):
            verified.append(Fact(claim=claim, evidence_quote=quote, source_url=url))

    if len(verified) < 3:
        return verified, f"Only {len(verified)} verified facts extracted (minimum 3 required from page text)"

    has_number_or_named_entity = False
    for vf in verified:
        claim_text = vf.claim
        # Check for numbers, percentages, currency, latency
        if re.search(r"\b\d+(?:[.,]\d+)?%?|\$\d+|\d+\s*(?:ms|s|hours|days|x|k|million|billion)\b", claim_text, re.IGNORECASE):
            has_number_or_named_entity = True
            break
        # Check for named entities (e.g. capitalized acronyms or multi-word proper nouns)
        if re.search(r"\b[A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)+\b", claim_text):
            has_number_or_named_entity = True
            break

    if not has_number_or_named_entity:
        return verified, "None of the verified facts contains a concrete number or named entity"

    return verified, None


# =====================================================================
# DRAFT BODY CODE CHECKS (STEP 6)
# =====================================================================

def check_length_and_hook(caption: str) -> Optional[str]:
    """Check post length (850 to 1200 characters) and first line length (<= 140 chars)."""
    clean = caption.strip()
    length = len(clean)
    if length < 850 or length > 1200:
        return f"Post length {length} is out of bounds (must be between 850 and 1200 characters)"

    first_line = clean.split("\n")[0].strip()
    if len(first_line) > 140:
        return f"First line length is {len(first_line)} characters, which exceeds the 140-character maximum"

    return None


def check_generic_hook(hook_text: str) -> Optional[str]:
    """Rejects generic hooks that lack concrete elements or use canned transitions."""
    clean_hook = hook_text.strip().lower()
    if "something significant is shifting" in clean_hook:
        return "Hook uses generic filler opener: 'Something significant is shifting'"
    if clean_hook.startswith("when evaluating") and "primary operational trade-off" in clean_hook:
        return "Hook uses generic formulaic template without concrete facts"
    if clean_hook.startswith("most teams treat") and "friction usually appears" in clean_hook:
        return "Hook uses generic formulaic template without concrete facts"

    # Must contain a number or named entity/concrete metric
    has_concrete = bool(
        re.search(r"\b\d+|\$[0-9]|[A-Z][a-z0-9]+", hook_text)
    )
    if not has_concrete:
        return "Hook lacks concrete elements (must contain a verified number or named entity)"

    return None


def check_topic_label_repetition(caption: str, topic_label: Optional[str]) -> Optional[str]:
    """Ensures topic_label appears at most once in the whole post."""
    if not topic_label:
        return None
    clean_label = topic_label.strip().lower()
    if len(clean_label) < 3:
        return None

    lower_caption = caption.lower()
    # Find all non-overlapping occurrences
    pattern = re.compile(r"\b" + re.escape(clean_label) + r"\b", re.IGNORECASE)
    matches = pattern.findall(lower_caption)
    if len(matches) > 1:
        return f"Topic label '{topic_label}' appears {len(matches)} times in post (maximum 1 allowed)"

    return None


def check_raw_title(caption: str, topic_title: Optional[str]) -> Optional[str]:
    """Check that the post does not contain topic_title or any 5+ word run copied from it."""
    if not topic_title:
        return None

    clean_title = topic_title.strip()
    if len(clean_title) >= 12 and clean_title.lower() in caption.lower():
        return f"Post contains raw source title: '{clean_title}'"

    words = re.findall(r"\b[\w'-]+\b", clean_title)
    if len(words) >= 5:
        lower_caption = caption.lower()
        for i in range(len(words) - 4):
            run_phrase = " ".join(words[i : i + 5]).lower()
            if run_phrase in lower_caption:
                return f"Post contains 5+ word phrase copied from raw title: '{run_phrase}'"
    return None


def _match_token_in_text(tok: str, text: str) -> bool:
    """Matches a token in text with tolerance for stem/plural inflections."""
    if tok in text:
        return True
    if len(tok) > 4 and tok.endswith("s") and tok[:-1] in text:
        return True
    if len(tok) > 5 and tok.endswith("ing") and tok[:-3] in text:
        return True
    if len(tok) > 5 and tok.endswith("ed") and tok[:-2] in text:
        return True
    return False


def check_fact_coverage(caption: str, facts: Optional[List[Any]]) -> Optional[str]:
    """Ensures at least 3 distinct verified facts are reflected in the post body."""
    if not facts or len(facts) < 3:
        return "Post has fewer than 3 verified facts available for grounding"

    lower_caption = caption.lower()
    reflected_count = 0

    for f in facts:
        claim_text = f.claim if hasattr(f, "claim") else (f.get("claim") if isinstance(f, dict) else str(f))
        # Extract meaningful tokens (numbers or words >= 4 chars not stopwords)
        tokens = [
            t.lower() for t in re.findall(r"\b[\w'-]{4,}\b|\b\d+%\b|\b\d+\b", claim_text)
            if t.lower() not in {"that", "with", "from", "this", "they", "have", "were", "been"}
        ]
        # If at least 2 tokens from this fact appear in the caption (with stem tolerance), consider it reflected
        matched = sum(1 for tok in tokens if _match_token_in_text(tok, lower_caption))
        if matched >= min(2, len(tokens)):
            reflected_count += 1

    if reflected_count < 3:
        return f"Post body reflects only {reflected_count} verified facts (at least 3 distinct facts required)"

    return None


def check_filler_phrases(caption: str) -> Optional[str]:
    """Detects vague filler phrases. More than 2 hits fails."""
    lower_caption = caption.lower()
    hits: List[str] = []
    for filler in FILLER_PHRASES:
        if filler.lower() in lower_caption:
            hits.append(filler)

    if len(hits) > 2:
        return f"Post contains {len(hits)} vague filler phrases (maximum 2 allowed): {', '.join(hits[:4])}"

    return None


def check_numbers_grounding(
    caption: str,
    source_text: str = "",
    key_facts: Optional[List[Any]] = None,
    topic_title: str = "",
) -> Optional[str]:
    """Check that percentages, decimals, and numbers with units appear in verified key_facts or source.
    Years 2020-2030 and small structural counts (1-10) are allowed.
    """
    facts_parts = []
    if key_facts:
        for kf in key_facts:
            if isinstance(kf, dict):
                facts_parts.append(kf.get("claim", "") + " " + kf.get("evidence_quote", "") + " " + kf.get("fact", ""))
            elif hasattr(kf, "claim"):
                facts_parts.append(getattr(kf, "claim", "") + " " + getattr(kf, "evidence_quote", ""))
            elif hasattr(kf, "fact"):
                facts_parts.append(getattr(kf, "fact", ""))
            else:
                facts_parts.append(str(kf))

    combined_grounding = f"{topic_title} {source_text} {' '.join(facts_parts)}"
    normalized_source = re.sub(r",(\d)", r"\1", combined_grounding).lower()

    # 1. Percentages: e.g. 43%, 78%
    percent_matches = re.findall(r"\b(\d+(?:\.\d+)?)\s*%", caption)
    for raw in percent_matches:
        search_target = f"{raw}%"
        if search_target not in normalized_source and raw not in normalized_source:
            return f"Ungrounded percentage '{raw}%' found in post (must appear in verified facts)"

    # 2. Numbers with units: ms, s, seconds, minutes, hours, days, x, $, k, million, billion, audits, kb, mb, gb, tb, qps, rps, tps, vcpus, cores, workers, connections
    unit_pattern = re.compile(
        r"(\$\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:ms|s|seconds?|minutes?|hours?|days?|x|k|million|billion|audits?|kb|mb|gb|tb|qps|rps|tps|vcpus?|cores?|workers?|conns?|connections?)\b)",
        re.IGNORECASE,
    )
    for match in unit_pattern.finditer(caption):
        token = match.group().strip()
        clean_token = re.sub(r"\s+", "", token.lower()).replace(",", "")
        digits_only = re.sub(r"[^\d\.]", "", clean_token)
        # Check scale expansion e.g. 10k -> 10000
        is_k = token.lower().endswith("k") and digits_only.isdigit()
        k_expanded = f"{digits_only}000" if is_k else None

        grounded = (
            clean_token in normalized_source.replace(" ", "")
            or digits_only in normalized_source
            or (k_expanded and (k_expanded in normalized_source or f"{digits_only}k" in normalized_source))
        )
        if not grounded:
            return f"Ungrounded number with unit '{token}' found in post (must appear in verified facts)"

    # 3. Decimals: e.g. 12.5, 0.85
    decimal_matches = re.findall(r"\b\d+\.\d+\b", caption)
    for dec in decimal_matches:
        if dec not in normalized_source:
            return f"Ungrounded decimal '{dec}' found in post (must appear in verified facts)"

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

        if cleaned_num not in normalized_source:
            return f"Ungrounded number '{raw}' found in post (must appear in verified facts)"

    return None


def check_banned_phrases(caption: str) -> Optional[str]:
    """Detects banned cliches and AI phrases from the avoid list."""
    lower_caption = caption.lower()
    for phrase in BANNED_PHRASES:
        if phrase.lower() in lower_caption:
            return f"Banned phrase detected: '{phrase}'"
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
            if phrase.lower() in profile_text:
                continue
            return f"Banned invented-experience phrase detected: '{phrase}' (not found in creator profile)"

    return None


def check_placeholders(caption: str, image_headline: str = "") -> Optional[str]:
    """Check that no unfilled template placeholders like '{' or '}' remain in output."""
    if "{" in caption or "}" in caption:
        return "Unfilled placeholder detected in post body: contains '{' or '}'"
    if "{" in image_headline or "}" in image_headline:
        return "Unfilled placeholder detected in image headline: contains '{' or '}'"
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


# =====================================================================
# HEADLINE & HASHTAG CHECKS (STEP 7)
# =====================================================================

def check_image_headline(
    headline: str,
    hook_text: str = "",
    topic_title: str = "",
) -> Optional[str]:
    """Check image headline:
    - Words <= 10, length <= 70.
    - No quotes, no trailing period.
    - Not a prefix or truncation of the hook.
    - No raw title.
    - No filler phrases.
    """
    clean = headline.strip()
    words = clean.split()
    if len(words) > 10:
        return f"Image headline has {len(words)} words, exceeding the 10-word limit"

    if len(clean) > 70:
        return f"Image headline length {len(clean)} exceeds 70 characters"

    if '"' in clean or "'" in clean or "“" in clean or "”" in clean:
        return "Image headline must not contain quotation marks"

    if clean.endswith("."):
        return "Image headline must not have a trailing period"

    # Check if headline is a prefix or cut-off of the hook
    if hook_text and len(clean) >= 15:
        norm_h = clean.lower()
        norm_hook = hook_text.strip().lower()
        if norm_hook.startswith(norm_h) or norm_h in norm_hook:
            return "Image headline is a direct prefix/truncation of the hook line"

    # Check if headline contains raw title
    if topic_title and len(topic_title) >= 15 and topic_title.lower() in clean.lower():
        return "Image headline contains raw source title"

    # Check if headline contains filler phrases
    for filler in FILLER_PHRASES:
        if filler.lower() in clean.lower():
            return f"Image headline contains filler phrase: '{filler}'"

    return None


def check_hashtags(hashtags: List[str]) -> Optional[str]:
    """Validates hashtags:
    - Exactly 1 to 3 hashtags.
    - CamelCase (e.g. #PostgreSQL #CloudArchitecture).
    - Length >= 4 characters (excluding '#').
    - None that are stopwords or fragments (#Why, #The, #How, #New).
    """
    if not hashtags or len(hashtags) < 1:
        return "At least 1 hashtag is required"
    if len(hashtags) > 3:
        return f"Too many hashtags ({len(hashtags)}); maximum allowed is 3"

    for tag in hashtags:
        cleaned = tag.lstrip("#")
        if len(cleaned) < 4:
            return f"Hashtag '{tag}' is too short (must be at least 4 characters)"
        if cleaned.lower() in STOPWORD_TAGS:
            return f"Hashtag '{tag}' is a banned stopword fragment"
        if not re.match(r"^[A-Z][a-zA-Z0-9]+$", cleaned):
            return f"Hashtag '{tag}' must be in CamelCase (e.g. #SystemDesign)"

    return None


# =====================================================================
# LLM JUDGE WITH SWAP TEST & FACT MAPPING (STEP 6)
# =====================================================================

class RelevanceCheckOutput(BaseModel):
    passed: bool = Field(description="True if post passes swap test, claims are fact-grounded, and first line makes specific promise")
    swap_test_passed: bool = Field(description="False if 2 or more paragraphs could sit in an unrelated post without changes")
    all_claims_grounded: bool = Field(description="True if every claim maps to verified facts; False otherwise")
    first_line_natural: bool = Field(description="True if opening line reads as natural English and makes a specific promise")
    unsupported_sentences: List[str] = Field(default_factory=list, description="Specific sentences that make unverified claims")
    reason: Optional[str] = Field(default=None, description="Concise reason for verdict")


RELEVANCE_CHECK_SYSTEM_PROMPT = """You are a rigorous editorial fact-checking judge and senior editor.
Evaluate this LinkedIn post against its assigned topic and verified facts using the following strict rubric:

1. SWAP TEST:
Read each paragraph. Could this paragraph be pasted into a post about a completely different topic without changes?
If 2 or more paragraphs are generic filler that could apply to any topic, FAIL the swap test (swap_test_passed=False).

2. FACT GROUNDING:
Does every paragraph and claim map to the verified facts provided?
If any sentence claims unverified benchmarks, invented events, or unsupported facts, list the failing sentence in unsupported_sentences and set all_claims_grounded=False.

3. FIRST LINE (HOOK) CHECK:
Does the first line read as natural, grammatically correct English, and does it make a specific concrete promise?
If it uses formulaic empty templates like "Something significant is shifting...", set first_line_natural=False.

If swap_test_passed=True, all_claims_grounded=True, and first_line_natural=True, set passed=True. Otherwise passed=False.
"""

RELEVANCE_CHECK_HUMAN_PROMPT = """Evaluate this draft:

# Assigned Topic: {topic_label}
# Assigned Angle: {angle}

# Verified Source Facts:
{key_facts_text}

# Draft Body:
<<<POST_TEXT>>>
{post_text}
<<<END_POST_TEXT>>>

Return your strict evaluation verdict.
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
    """Runs a strict LLM judge call verifying topic fidelity, swap test, and factual grounding."""
    if model is None:
        return None

    facts_text = "\n".join([
        f"- Claim: {kf.claim if hasattr(kf, 'claim') else kf.get('claim', '')} | Quote: \"{kf.evidence_quote if hasattr(kf, 'evidence_quote') else kf.get('evidence_quote', '')}\""
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
        res = chain.invoke(prompt_input)
        if isinstance(res, dict):
            passed = bool(res.get("passed", False))
            reason = res.get("reason", "")
            unsupported = res.get("unsupported_sentences", [])
        else:
            passed = bool(getattr(res, "passed", False))
            reason = getattr(res, "reason", "")
            unsupported = getattr(res, "unsupported_sentences", [])

        if not passed:
            msg = f"LLM judge rejected draft: {reason or 'Failed swap test or factual grounding'}"
            if unsupported:
                msg += f" (Unsupported sentences: {'; '.join(unsupported[:2])})"
            return msg
    except Exception as exc:
        logger.warning(f"LLM relevance check exception: {exc}")
        # When model judge fails, return explicit failure - no silent passes!
        return f"LLM relevance judge evaluation failed: {exc}"

    return None


# =====================================================================
# IMAGE HEADLINE GENERATOR (STEP 7)
# =====================================================================

IMAGE_HEADLINE_SYSTEM_PROMPT = """You are a creative art director.
Generate a punchy companion image headline of AT MOST 10 WORDS (and under 70 characters) from the post's main point.
HARD RULES:
- Use words and concepts directly supported by the post body.
- Do NOT simply copy or truncate the opening hook line.
- Plain text only: NO quotation marks, NO trailing periods.
- Maximum 10 words.
"""

IMAGE_HEADLINE_HUMAN_PROMPT = """Post body:
<<<POST_TEXT>>>
{post_text}
<<<END_POST_TEXT>>>

Output the headline.
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
    hook_text: str = "",
    topic_title: str = "",
) -> str:
    """Generates the companion image headline AFTER the final post exists,
    from the post's main point (max 10 words, max 70 chars), using words supported by post.
    Validates that headline is not a simple prefix or truncation of the hook.
    """
    if model is not None:
        try:
            structured_model = model.with_structured_output(HeadlineOutput)
            chain = IMAGE_HEADLINE_PROMPT | structured_model
            res: HeadlineOutput = chain.invoke({"post_text": post_text})
            clean = res.headline.strip().strip("\"'").rstrip(".")
            words = clean.split()[:10]
            candidate = " ".join(words)[:70].strip().rstrip(".")
            err = check_image_headline(candidate, hook_text=hook_text, topic_title=topic_title)
            if not err:
                return candidate
        except Exception as exc:
            logger.debug(f"Image headline generation error: {exc}")

    # Deterministic fallback from the core conclusion paragraph (2nd or 3rd paragraph, not hook)
    paras = [p.strip() for p in post_text.strip().split("\n\n") if p.strip()]
    target_para = paras[1] if len(paras) > 2 else paras[-1]
    sentences = re.split(r"[.!?\n]", target_para)
    target_sentence = sentences[0].strip()
    words = [w for w in target_sentence.split() if w.lower() not in {"when", "evaluating", "organizations", "that"}][:7]
    headline = " ".join(words)[:65].strip().rstrip(".")
    if not headline or check_image_headline(headline, hook_text=hook_text):
        headline = "Operational Reliability In Production"
    return headline


# =====================================================================
# AGGREGATE RUN_ALL_CHECKS
# =====================================================================

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
    """Runs all deterministic checks plus the LLM judge check.
    Returns list of failure messages.
    """
    failures: List[str] = []

    # 1. Structural checks
    res = check_length_and_hook(caption)
    if res:
        failures.append(res)

    res = check_hashtags(hashtags)
    if res:
        failures.append(res)

    res = check_banned_phrases(caption)
    if res:
        failures.append(res)

    first_line = caption.strip().split("\n")[0].strip()
    res = check_generic_hook(first_line)
    if res:
        failures.append(res)

    res = check_image_headline(image_headline, hook_text=first_line, topic_title=topic_title or "")
    if res:
        failures.append(res)

    # 2. Placeholder detection
    res = check_placeholders(caption, image_headline)
    if res:
        failures.append(res)

    # 3. Raw title and topic label repetition
    res = check_raw_title(caption, topic_title)
    if res:
        failures.append(res)

    res = check_topic_label_repetition(caption, topic_label)
    if res:
        failures.append(res)

    # 4. Fact coverage & number grounding
    res = check_fact_coverage(caption, key_facts)
    if res:
        failures.append(res)

    res = check_numbers_grounding(caption, source_text=source_text, key_facts=key_facts, topic_title=topic_title or "")
    if res:
        failures.append(res)

    # 5. Filler phrases detection
    res = check_filler_phrases(caption)
    if res:
        failures.append(res)

    # 6. Invented experience phrase detection
    res = check_banned_experience_phrases(caption, profile=profile)
    if res:
        failures.append(res)

    # 7. Topic presence check
    res = check_topic_presence(caption, topic_label)
    if res:
        failures.append(res)

    # 8. LLM judge check (swap test & unverified claims)
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
