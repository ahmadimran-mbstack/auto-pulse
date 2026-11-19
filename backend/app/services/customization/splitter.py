"""Previous-post splitter, deterministic style feature extractor, and quality flagger."""

import hashlib
import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set


_EXPLICIT_SEP_RE = re.compile(
    r"(?m)^(?:\s*[-*_]{3,}\s*|\s*={3,}\s*|\s*(?:Post|POST)\s*#?\d+[:.\-]?\s*|\s*#\d+\s*)$"
)
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001F9FF\U0001FA00-\U0001FAFF\u2600-\u27BF]+",
    flags=re.UNICODE,
)
_HASHTAG_RE = re.compile(r"(?<!\w)#([A-Za-z0-9_]{2,50})")
_URL_RE = re.compile(r"https?://\S+")
_BULLET_LINE_RE = re.compile(r"(?m)^\s*(?:[-•*]|\d+[.)])\s+")
_FIRST_PERSON_RE = re.compile(r"\b(?:I|I'm|I've|I'd|my|me|we|our|we're|we've)\b", re.IGNORECASE)


@dataclass
class SplitSample:
    ordinal: int
    text: str
    char_count: int
    features: Dict[str, Any]
    quality_flag: Optional[str]
    content_hash: str


def compute_sample_features(text: str) -> Dict[str, Any]:
    """Compute deterministic style features for a single LinkedIn post sample."""
    clean = (text or "").strip()
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", clean) if p.strip()]
    lines = [ln.strip() for ln in clean.splitlines() if ln.strip()]
    first_line = lines[0] if lines else ""
    last_line = lines[-1] if lines else ""

    sentences = [s.strip() for s in re.split(r"[.!?]+(?:\s+|$)", clean) if s.strip()]
    words = re.findall(r"\b\w+\b", clean)
    avg_sentence_words = round(len(words) / max(1, len(sentences)), 1)

    emojis = _EMOJI_RE.findall(clean)
    emoji_count = sum(len(e) for e in emojis)
    hashtags = _HASHTAG_RE.findall(clean)
    hashtag_case = "none"
    if hashtags:
        if all(t[0].isupper() and any(c.islower() for c in t) for t in hashtags):
            hashtag_case = "camel"
        elif all(t.islower() for t in hashtags):
            hashtag_case = "lower"
        else:
            hashtag_case = "any"

    first_person_hits = len(_FIRST_PERSON_RE.findall(clean))
    first_person_ratio = round(first_person_hits / max(1, len(words)), 4)

    return {
        "char_count": len(clean),
        "word_count": len(words),
        "paragraph_count": len(paragraphs),
        "line_count": len(lines),
        "first_line_len": len(first_line),
        "avg_sentence_words": avg_sentence_words,
        "emoji_count": emoji_count,
        "hashtag_count": len(hashtags),
        "hashtag_case": hashtag_case,
        "has_bullets": bool(_BULLET_LINE_RE.search(clean)),
        "ends_with_question": last_line.endswith("?"),
        "exclamation_count": clean.count("!"),
        "first_person_ratio": first_person_ratio,
        "last_line": last_line[:160],
    }


def _token_set(text: str) -> Set[str]:
    return set(re.findall(r"[a-z0-9]{2,}", (text or "").lower()))


def _jaccard(a: Set[str], b: Set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _flag_sample(text: str, seen_tokens: List[Set[str]]) -> Optional[str]:
    clean = (text or "").strip()
    if len(clean) < 150:
        return "too_short"
    no_urls = _URL_RE.sub("", clean).strip()
    if len(no_urls) < 100 or not re.search(r"[A-Za-z]{3,}\s+[A-Za-z]{3,}", no_urls):
        return "not_a_post"
    toks = _token_set(clean)
    for prev in seen_tokens:
        if _jaccard(toks, prev) > 0.9:
            return "duplicate"
    seen_tokens.append(toks)
    return None


def split_previous_posts(raw_text: str, max_samples: int = 200) -> List[SplitSample]:
    """Split raw previous-posts text into normalized samples with features and quality flags."""
    text = (raw_text or "").strip()
    if not text:
        return []

    # 1. Explicit separators (---, ***, ===, Post 1, #1)
    chunks = [c.strip() for c in _EXPLICIT_SEP_RE.split(text) if c and c.strip()]

    # 2. If single chunk and large, try splitting on 3+ newlines or double-blank lines when chunks look like posts
    if len(chunks) <= 1 and len(text) > 1200:
        triple_split = [c.strip() for c in re.split(r"\n{3,}", text) if c and c.strip()]
        if len(triple_split) >= 2:
            chunks = triple_split

    seen_tokens: List[Set[str]] = []
    samples: List[SplitSample] = []
    for idx, chunk in enumerate(chunks[:max_samples]):
        normalized = chunk[:3000].strip()
        if not normalized:
            continue
        flag = _flag_sample(normalized, seen_tokens)
        features = compute_sample_features(normalized)
        chash = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        samples.append(
            SplitSample(
                ordinal=idx,
                text=normalized,
                char_count=len(normalized),
                features=features,
                quality_flag=flag,
                content_hash=chash,
            )
        )
    return samples
