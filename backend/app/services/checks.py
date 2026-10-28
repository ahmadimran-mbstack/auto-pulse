import datetime
import re
from typing import List, Optional, Set, Tuple

from app.agents.scanner import get_banned_phrases

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


# Check caption length, paragraph count, and first line length
def check_caption_structure(caption: str) -> Optional[str]:
    clean_caption = caption.strip()
    length = len(clean_caption)
    if length < 700 or length > 1800:
        return f"Caption length {length} is out of bounds (must be between 700 and 1800 characters)"

    # Split paragraphs by double newlines or lines with whitespace
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean_caption) if p.strip()]
    if len(paragraphs) < 3:
        return f"Caption has {len(paragraphs)} paragraph(s), but at least 3 paragraphs are required"

    first_line = clean_caption.split("\n")[0].strip()
    if len(first_line) > 140:
        return f"First line length is {len(first_line)} characters, which exceeds the 140-character maximum"

    return None


# Check hashtags count and alphanumeric validity, and verify no URLs in caption
def check_hashtags_and_urls(caption: str, hashtags: List[str]) -> Optional[str]:
    if len(hashtags) > 3:
        return f"Too many hashtags ({len(hashtags)}); maximum allowed is 3"

    for tag in hashtags:
        cleaned_tag = tag.lstrip("#")
        if not re.match(r"^[A-Za-z0-9]+$", cleaned_tag):
            return f"Hashtag '{tag}' contains invalid characters (letters and digits only)"

    # Look for URLs in the caption body
    if re.search(r"https?://|www\.", caption, re.IGNORECASE):
        return "Caption contains a URL link, but URLs are forbidden in post body"

    return None


# Check that no banned cliche phrases appear in the caption
def check_banned_phrases(caption: str) -> Optional[str]:
    lower_caption = caption.lower()
    phrases = get_current_banned_phrases()
    for phrase in phrases:
        if phrase.lower() in lower_caption:
            return f"Caption contains banned phrase: '{phrase}'"
    return None


# Check that all 2+ digit numbers are grounded in the source text
def check_numbers_grounding(caption: str, source_text: str) -> Optional[str]:
    # Normalise source text by removing thousands commas
    normalized_source = re.sub(r",(\d)", r"\1", source_text)

    # Next year cutoff for exempt year values
    current_year = datetime.date.today().year
    next_year = current_year + 1

    # Find candidate numbers in caption: digits optionally with commas and percent
    raw_matches = re.findall(r"\b\d[\d,]*%?\b", caption)
    for raw in raw_matches:
        # Strip commas and trailing percent sign to get pure digits
        cleaned_num = raw.replace(",", "").rstrip("%")
        if len(cleaned_num) >= 2 and cleaned_num.isdigit():
            val = int(cleaned_num)
            # 4-digit years from 2020 through next year are allowed without explicit source mention
            if len(cleaned_num) == 4 and 2020 <= val <= next_year:
                continue

            # Number must be present in the source text
            if cleaned_num not in normalized_source:
                return f"Ungrounded number '{raw}' found in caption (must appear in source text)"

    return None


# Compute word 5-grams from text
def get_word_5grams(text_content: str) -> Set[Tuple[str, ...]]:
    words = re.findall(r"[a-z0-9]+", text_content.lower())
    if len(words) < 5:
        return set()
    return {tuple(words[i : i + 5]) for i in range(len(words) - 4)}


# Check that word 5-gram overlap with last 14 days of captions is under 40 percent
def check_repeat_overlap(caption: str, recent_captions: List[str]) -> Optional[str]:
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


# Check image headline word count, character count, quotes, and punctuation
def check_image_headline(headline: str) -> Optional[str]:
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


# Run all pure verification checks and collect any failures
def run_all_checks(
    caption: str,
    hashtags: List[str],
    image_headline: str,
    source_text: str,
    recent_captions: Optional[List[str]] = None,
) -> List[str]:
    failures: List[str] = []

    res = check_caption_structure(caption)
    if res:
        failures.append(res)

    res = check_hashtags_and_urls(caption, hashtags)
    if res:
        failures.append(res)

    res = check_banned_phrases(caption)
    if res:
        failures.append(res)

    res = check_numbers_grounding(caption, source_text)
    if res:
        failures.append(res)

    res = check_repeat_overlap(caption, recent_captions or [])
    if res:
        failures.append(res)

    res = check_image_headline(image_headline)
    if res:
        failures.append(res)

    return failures
