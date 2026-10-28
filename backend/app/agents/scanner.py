import math
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Set, Tuple
from pydantic import BaseModel, Field
import yaml

# Path to patterns configuration file
KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"
PATTERNS_FILE = KNOWLEDGE_DIR / "ai_slop_patterns.yaml"


class Finding(BaseModel):
    rule_id: str
    category: str
    message: str
    start: int
    end: int
    quote: str
    points: int


class ScanResult(BaseModel):
    deterministic_score: int = Field(ge=0, le=100)
    category_scores: Dict[str, int]
    findings: List[Finding]


_CACHED_CONFIG: Optional[Dict[str, Any]] = None


def load_patterns_config(reload: bool = False) -> Dict[str, Any]:
    global _CACHED_CONFIG
    if _CACHED_CONFIG is None or reload:
        if not PATTERNS_FILE.exists():
            raise FileNotFoundError(f"Patterns file not found at {PATTERNS_FILE}")
        with open(PATTERNS_FILE, "r", encoding="utf-8") as f:
            _CACHED_CONFIG = yaml.safe_load(f)
    return _CACHED_CONFIG


def get_banned_phrases() -> List[str]:
    cfg = load_patterns_config()
    return list(cfg.get("banned_phrases", []))


def get_banned_words() -> List[str]:
    cfg = load_patterns_config()
    b_words = cfg.get("banned_words", {})
    if isinstance(b_words, dict):
        return list(b_words.get("strong", [])) + list(b_words.get("weak", []))
    return list(b_words)


def _split_into_paragraphs(text: str) -> List[Tuple[int, int, str]]:
    paragraphs = []
    # Find spans of non-empty paragraphs
    for match in re.finditer(r"[^\n]+(?:\n(?!\n)[^\n]+)*", text):
        p_text = match.group().strip()
        if p_text:
            paragraphs.append((match.start(), match.end(), p_text))
    return paragraphs


def _split_into_sentences(text: str) -> List[Tuple[int, int, str]]:
    sentences = []
    # Sentence splitting by period, exclamation, question mark followed by space or end
    pattern = re.compile(r"([A-Z0-9\"'‘“\(\[][^\.!?\n]*[\.!?]+)", re.DOTALL)
    for match in pattern.finditer(text):
        s_text = match.group().strip()
        if s_text:
            sentences.append((match.start(), match.end(), s_text))
    if not sentences and text.strip():
        sentences.append((0, len(text), text.strip()))
    return sentences


def _get_word_pattern(clean_w: str) -> str:
    if clean_w == "game-changer":
        return r"(?i)\bgame[\s-]changer\b"
    elif clean_w == "cutting-edge":
        return r"(?i)\bcutting[\s-]edge\b"
    elif clean_w == "ever-evolving":
        return r"(?i)\bever[\s-]evolving\b"
    elif clean_w == "delve":
        return r"(?i)\bdelv(?:e|es|ed|ing)\b"
    elif clean_w == "leverage":
        return r"(?i)\bleverag(?:e|es|ed|ing)\b"
    elif clean_w == "navigate":
        return r"(?i)\bnavigat(?:e|es|ed|ing)\b"
    elif clean_w == "revolutionize":
        return r"(?i)\brevolutioniz(?:e|es|ed|ing)\b"
    elif clean_w == "streamline":
        return r"(?i)\bstreamlin(?:e|es|ed|ing)\b"
    elif clean_w == "supercharge":
        return r"(?i)\bsupercharg(?:e|es|ed|ing)\b"
    elif clean_w == "foster":
        return r"(?i)\bfoster(?:s|ed|ing)?\b"
    elif clean_w == "harness":
        return r"(?i)\bharness(?:es|ed|ing)?\b"
    elif clean_w == "empower":
        return r"(?i)\bempower(?:s|ed|ing)?\b"
    elif clean_w == "unlock":
        return r"(?i)\bunlock(?:s|ed|ing)?\b"
    elif clean_w == "elevate":
        return r"(?i)\belevat(?:e|es|ed|ing)\b"
    elif clean_w == "unleash":
        return r"(?i)\bunleash(?:es|ed|ing)?\b"
    elif clean_w == "synergy":
        return r"(?i)\bsynerg(?:y|ies)\b"
    elif clean_w == "paradigm":
        return r"(?i)\bparadigm(?:s)?\b"
    elif clean_w == "tapestry":
        return r"(?i)\btapestr(?:y|ies)\b"
    elif clean_w == "realm":
        return r"(?i)\brealm(?:s)?\b"
    elif clean_w == "testament":
        return r"(?i)\btestament(?:s)?\b"
    elif clean_w == "journey":
        return r"(?i)\bjourney(?:s|ed|ing)?\b"
    elif clean_w == "landscape":
        return r"(?i)\blandscape(?:s)?\b"
    elif clean_w == "vibrant":
        return r"(?i)\bvibrant\b"
    elif clean_w == "crucial":
        return r"(?i)\bcrucial\b"
    elif clean_w == "robust":
        return r"(?i)\brobust\b"
    else:
        return (
            rf"(?i)\b{re.escape(clean_w)}(?:s|es|d|ed|ing)?\b"
            if len(clean_w) > 4 and clean_w.isalpha()
            else rf"(?i)\b{re.escape(clean_w)}\b"
        )


def scan(text: str) -> ScanResult:
    config = load_patterns_config()
    weights: Dict[str, int] = config.get("weights", {})
    caps: Dict[str, int] = config.get("caps", {})

    banned_words_cap = caps.get("banned_words_total", 36)
    banned_phrases_cap = caps.get("banned_phrases_total", 40)
    punctuation_cap = caps.get("punctuation_total", 25)
    structure_cap = caps.get("structure_total", 40)
    rhythm_cap = caps.get("rhythm_total", 25)
    max_score = caps.get("max_deterministic_score", 100)

    raw_findings: List[Finding] = []

    if not text or not text.strip():
        return ScanResult(
            deterministic_score=0,
            category_scores={
                "banned_word": 0,
                "banned_phrase": 0,
                "punctuation": 0,
                "structure": 0,
                "rhythm": 0,
            },
            findings=[],
        )

    # 1. BANNED WORDS (Two Tiers)
    banned_words_cfg = config.get("banned_words", {})
    if isinstance(banned_words_cfg, dict):
        strong_words = banned_words_cfg.get("strong", [])
        weak_words = banned_words_cfg.get("weak", [])
    else:
        strong_words = banned_words_cfg
        weak_words = []

    strong_weight = weights.get("banned_word_strong", weights.get("banned_word", 6))
    weak_weight = weights.get("banned_word_weak", 2)
    min_distinct_weak = weights.get("min_distinct_weak_words", 2)

    # Strong tier words (6 points each)
    for w in strong_words:
        clean_w = w.strip()
        if not clean_w:
            continue
        pat = _get_word_pattern(clean_w)
        for m in re.finditer(pat, text):
            raw_findings.append(
                Finding(
                    rule_id=f"BANNED_WORD_{clean_w.upper().replace('-', '_')}",
                    category="banned_word",
                    message=f"Banned AI buzzword (strong): '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=strong_weight,
                )
            )

    # Weak tier words (2 points each, only if >= min_distinct_weak distinct weak words appear)
    weak_matches_by_word: Dict[str, List[re.Match]] = {}
    for w in weak_words:
        clean_w = w.strip()
        if not clean_w:
            continue
        pat = _get_word_pattern(clean_w)
        m_list = list(re.finditer(pat, text))
        if m_list:
            weak_matches_by_word[clean_w] = m_list

    distinct_weak_count = len(weak_matches_by_word)
    is_weak_charged = distinct_weak_count >= min_distinct_weak

    for clean_w, matches in weak_matches_by_word.items():
        for m in matches:
            pts = weak_weight if is_weak_charged else 0
            msg = (
                f"Banned AI buzzword (weak tier, {distinct_weak_count} distinct weak words found): '{m.group()}'"
                if is_weak_charged
                else f"Ambiguous weak word '{m.group()}' (points suppressed: requires >= {min_distinct_weak} distinct weak words in post, found {distinct_weak_count})"
            )
            raw_findings.append(
                Finding(
                    rule_id=f"BANNED_WORD_WEAK_{clean_w.upper().replace('-', '_')}",
                    category="banned_word",
                    message=msg,
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=pts,
                )
            )

    # 2. BANNED PHRASES
    banned_phrases = config.get("banned_phrases", [])
    phrase_weight = weights.get("banned_phrase", 8)
    for p in banned_phrases:
        clean_p = p.strip()
        if not clean_p:
            continue
        escaped_p = re.escape(clean_p)
        pat = rf"(?i)(?:^|(?<=[\s\(\[\"']))({escaped_p})(?=$|[\s\.,!\?\)\]\"'])"
        for m in re.finditer(pat, text):
            quote_text = m.group(1)
            start_idx = m.start(1)
            end_idx = m.end(1)
            rule_slug = re.sub(r"[^a-zA-Z0-9]+", "_", clean_p).strip("_").upper()[:30]
            raw_findings.append(
                Finding(
                    rule_id=f"BANNED_PHRASE_{rule_slug}",
                    category="banned_phrase",
                    message=f"Banned generic phrase: '{quote_text}'",
                    start=start_idx,
                    end=end_idx,
                    quote=quote_text,
                    points=phrase_weight,
                )
            )

    # 3. PUNCTUATION & FORMATTING
    em_weight = weights.get("em_dash", 5)
    for m in re.finditer(r"(—|--)", text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_EM_DASH",
                category="punctuation",
                message="Em dash or double dash detected",
                start=m.start(),
                end=m.end(),
                quote=m.group(),
                points=em_weight,
            )
        )

    arrow_weight = weights.get("arrow_symbol", 5)
    for m in re.finditer(r"(→|➡|➜|➤|►|▶|-->)", text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_ARROW_SYMBOL",
                category="punctuation",
                message="Arrow symbol detected",
                start=m.start(),
                end=m.end(),
                quote=m.group(),
                points=arrow_weight,
            )
        )

    ellipsis_weight = weights.get("dramatic_ellipsis", 5)
    for m in re.finditer(r"(\.\.\.|…)", text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_DRAMATIC_ELLIPSIS",
                category="punctuation",
                message="Dramatic ellipsis detected",
                start=m.start(),
                end=m.end(),
                quote=m.group(),
                points=ellipsis_weight,
            )
        )

    exclam_weight = weights.get("excess_exclamation", 6)
    exclam_matches = list(re.finditer(r"!", text))
    if len(exclam_matches) > 2:
        for m in exclam_matches[2:]:
            raw_findings.append(
                Finding(
                    rule_id="PUNCT_EXCESS_EXCLAMATION",
                    category="punctuation",
                    message=f"Excessive exclamation mark ({len(exclam_matches)} total in post, max allowed 2)",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=exclam_weight,
                )
            )

    emoji_line_weight = weights.get("emoji_at_line_start", 7)
    emoji_regex = re.compile(
        r"(?m)^\s*([\U00010000-\U0010ffff]|\u2600-\u27bf|\ud83c[\udf00-\udfff]|\ud83d[\udc00-\ude4f]|\ud83e[\udd00-\udeff])"
    )
    for m in emoji_regex.finditer(text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_EMOJI_LINE_START",
                category="punctuation",
                message="Emoji at line start",
                start=m.start(1),
                end=m.end(1),
                quote=m.group(1),
                points=emoji_line_weight,
            )
        )

    md_weight = weights.get("markdown_formatting", 6)
    for m in re.finditer(r"(\*\*[^*\n]+\*\*|__[^_\n]+__)", text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_MARKDOWN_BOLD",
                category="punctuation",
                message="Markdown bold formatting not supported on LinkedIn",
                start=m.start(),
                end=m.end(),
                quote=m.group(),
                points=md_weight,
            )
        )

    for m in re.finditer(r"(?m)^(\#{1,6}\s+[^\n]+)", text):
        raw_findings.append(
            Finding(
                rule_id="PUNCT_MARKDOWN_HEADER",
                category="punctuation",
                message="Markdown header formatting not supported on LinkedIn",
                start=m.start(),
                end=m.end(),
                quote=m.group(),
                points=md_weight,
            )
        )

    tag_weight = weights.get("excess_hashtags", 6)
    hashtag_matches = list(re.finditer(r"#\w+", text))
    if len(hashtag_matches) > 3:
        for m in hashtag_matches[3:]:
            raw_findings.append(
                Finding(
                    rule_id="PUNCT_EXCESS_HASHTAGS",
                    category="punctuation",
                    message=f"Excessive hashtag '{m.group()}' (max 3 allowed)",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=tag_weight,
                )
            )

    # 4. STRUCTURE PATTERNS
    struct_patterns = config.get("structural_patterns", {})
    cliche_weight = weights.get("structure_cliche", 8)

    pat_info = struct_patterns.get("not_just_x_its_y", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_NOT_JUST_X_ITS_Y",
                    category="structure",
                    message="Cliche 'not just X, it's Y' contrast frame",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=cliche_weight,
                )
            )

    pat_info = struct_patterns.get("not_only_x_but_also_y", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_NOT_ONLY_X_BUT_ALSO_Y",
                    category="structure",
                    message="Formal academic 'not only X but also Y' structure",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=cliche_weight,
                )
            )

    pat_info = struct_patterns.get("its_not_about_x_its_about_y", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_ITS_NOT_ABOUT_X_ITS_ABOUT_Y",
                    category="structure",
                    message="'It's not about X, it's about Y' reframing",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=cliche_weight,
                )
            )

    pat_info = struct_patterns.get("whether_youre_x_or_y", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_WHETHER_YOURE_X_OR_Y",
                    category="structure",
                    message="'Whether you're X or Y' generalization",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=cliche_weight,
                )
            )

    serves_weight = weights.get("serves_stands_as", 5)
    pat_info = struct_patterns.get("serves_stands_as", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_SERVES_STANDS_AS",
                    category="structure",
                    message="Pretentious 'serves as' / 'stands as' instead of direct 'is'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=serves_weight,
                )
            )

    colon_weight = weights.get("colon_reveal", 6)
    pat_info = struct_patterns.get("colon_reveals", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_COLON_REVEAL",
                    category="structure",
                    message=f"Dramatic colon reveal: '{m.group().strip()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=colon_weight,
                )
            )

    part_weight = weights.get("participle_tail", 6)
    pat_info = struct_patterns.get("participle_tails", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_PARTICIPLE_TAIL",
                    category="structure",
                    message=f"AI-typical participle tail: '{m.group().strip()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=part_weight,
                )
            )

    hedge_weight = weights.get("stacked_hedges", 6)
    pat_info = struct_patterns.get("stacked_hedges", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_STACKED_HEDGES",
                    category="structure",
                    message=f"Stacked hedging phrase: '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=hedge_weight,
                )
            )

    infl_weight = weights.get("inflated_significance", 7)
    pat_info = struct_patterns.get("inflated_significance", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_INFLATED_SIGNIFICANCE",
                    category="structure",
                    message=f"Inflated significance phrase: '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=infl_weight,
                )
            )

    vague_weight = weights.get("vague_source", 7)
    pat_info = struct_patterns.get("vague_sources", {})
    if pat_info.get("regex"):
        for m in re.finditer(pat_info["regex"], text):
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_VAGUE_SOURCE",
                    category="structure",
                    message=f"Vague unsourced authority: '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=vague_weight,
                )
            )

    numbered_bold_pat = re.compile(r"(?m)^\s*(\d+[\.\)]\s*(?:\*\*[^*\n]+\*\*|__[^_\n]+__))")
    for m in numbered_bold_pat.finditer(text):
        raw_findings.append(
            Finding(
                rule_id="STRUCT_NUMBERED_LESSONS_BOLD",
                category="structure",
                message="Numbered lesson list with bold heading",
                start=m.start(1),
                end=m.end(1),
                quote=m.group(1),
                points=cliche_weight,
            )
        )

    bullet_line_pat = re.compile(
        r"(?m)^\s*([→➡➜➤►▶\-\*]|[\U00010000-\U0010ffff]|\u2600-\u27bf)\s+([^\n]{3,})"
    )
    bullet_matches = list(bullet_line_pat.finditer(text))
    for bm in bullet_matches:
        bullet_char = bm.group(1)
        if bullet_char in "→➡➜➤►▶" or ord(bullet_char[0]) > 127:
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_EMOJI_ARROW_BULLET",
                    category="structure",
                    message=f"Emoji or arrow bullet point: '{bullet_char}'",
                    start=bm.start(1),
                    end=bm.end(1),
                    quote=bullet_char,
                    points=weights.get("arrow_symbol", 5),
                )
            )

    three_item_pat = re.compile(r"\b([\w\s]{2,25}),\s+([\w\s]{2,25}),\s+(?:and|or)\s+([\w\s]{2,25})\b")
    three_matches = list(three_item_pat.finditer(text))
    if len(three_matches) > 2:
        three_weight = weights.get("rule_of_three_repeated", 6)
        for m in three_matches[2:]:
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_RULE_OF_THREE_REPEATED",
                    category="structure",
                    message=f"Repetitive rule-of-three list pattern: '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=three_weight,
                )
            )

    x_isnt_y_pat = re.compile(r"(?i)\b\w+\s+isn['’]?t\s+[\w\s]{1,30}?[.?!]\s*(?:it['’]?s|it\s+is)\b")
    x_isnt_y_matches = list(x_isnt_y_pat.finditer(text))
    if len(x_isnt_y_matches) >= 2:
        isnt_weight = weights.get("repeated_x_isnt_y", 7)
        for m in x_isnt_y_matches[1:]:
            raw_findings.append(
                Finding(
                    rule_id="STRUCT_REPEATED_X_ISNT_Y",
                    category="structure",
                    message=f"Repeated 'X isn't Y. It's Z.' contrast structure: '{m.group()}'",
                    start=m.start(),
                    end=m.end(),
                    quote=m.group(),
                    points=isnt_weight,
                )
            )

    paragraphs = _split_into_paragraphs(text)
    if paragraphs:
        first_p_start, first_p_end, first_p = paragraphs[0]
        first_sentences = _split_into_sentences(first_p)
        if first_sentences and first_sentences[0][2].endswith("?"):
            if len(first_sentences) > 1:
                ans_s = first_sentences[1]
                q_hook_weight = weights.get("rhetorical_question_hook", 7)
                raw_findings.append(
                    Finding(
                        rule_id="STRUCT_RHETORICAL_QUESTION_HOOK",
                        category="structure",
                        message="Rhetorical question hook answered immediately",
                        start=first_sentences[0][0] + first_p_start,
                        end=ans_s[1] + first_p_start,
                        quote=text[first_sentences[0][0] + first_p_start : ans_s[1] + first_p_start],
                        points=q_hook_weight,
                    )
                )

    if len(paragraphs) >= 3:
        if len(bullet_matches) == 3:
            last_p = paragraphs[-1][2]
            if last_p.strip().endswith("?"):
                tmpl_weight = weights.get("bullets_template", 8)
                raw_findings.append(
                    Finding(
                        rule_id="STRUCT_HOOK_3_BULLETS_QUESTION_TEMPLATE",
                        category="structure",
                        message="Formulaic 'hook + 3 bullets + question' template detected",
                        start=paragraphs[0][0],
                        end=paragraphs[-1][1],
                        quote=text[paragraphs[0][0] : paragraphs[-1][1]],
                        points=tmpl_weight,
                    )
                )

    # 5. RHYTHM
    if len(paragraphs) >= config.get("rhythm_rules", {}).get("min_paragraphs_for_one_sentence_check", 3):
        all_one_sentence = True
        for _, _, p_str in paragraphs:
            s_list = _split_into_sentences(p_str)
            if len(s_list) != 1:
                all_one_sentence = False
                break
        if all_one_sentence:
            rhythm_one_weight = weights.get("rhythm_one_sentence_paragraphs", 8)
            raw_findings.append(
                Finding(
                    rule_id="RHYTHM_ONE_SENTENCE_PARAGRAPHS",
                    category="rhythm",
                    message="Every paragraph is exactly one sentence (monotone AI cadence)",
                    start=paragraphs[0][0],
                    end=paragraphs[-1][1],
                    quote=text[paragraphs[0][0] : paragraphs[-1][1]],
                    points=rhythm_one_weight,
                )
            )

    sentences = _split_into_sentences(text)
    min_sentences = config.get("rhythm_rules", {}).get("min_sentences_for_length_uniformity", 4)
    if len(sentences) >= min_sentences:
        word_counts = [len(re.findall(r"\b\w+\b", s[2])) for s in sentences]
        mean_len = sum(word_counts) / len(word_counts)
        if mean_len >= 7:
            variance = sum((x - mean_len) ** 2 for x in word_counts) / len(word_counts)
            std_dev = math.sqrt(variance)
            threshold_std_dev = config.get("rhythm_rules", {}).get("sentence_length_std_dev_threshold", 3.5)
            if std_dev <= threshold_std_dev:
                equal_weight = weights.get("rhythm_equal_sentence_lengths", 7)
                raw_findings.append(
                    Finding(
                        rule_id="RHYTHM_EQUAL_SENTENCE_LENGTHS",
                        category="rhythm",
                        message=f"Monotone sentence lengths (word count std dev {std_dev:.1f} <= {threshold_std_dev})",
                        start=sentences[0][0],
                        end=sentences[-1][1],
                        quote=text[sentences[0][0] : sentences[-1][1]],
                        points=equal_weight,
                    )
                )

    opener_map: Dict[str, List[Tuple[int, int]]] = {}
    for s_start, s_end, s_str in sentences:
        words = re.findall(r"\b\w+\b", s_str)
        if len(words) >= 2:
            opener = f"{words[0].lower()} {words[1].lower()}"
            opener_map.setdefault(opener, []).append((s_start, s_start + len(words[0]) + 1 + len(words[1])))

    for opener, occurrences in opener_map.items():
        if len(occurrences) >= config.get("rhythm_rules", {}).get("repeated_sentence_opener_threshold", 3):
            rep_weight = weights.get("rhythm_repeated_sentence_opener", 7)
            for occ_start, occ_end in occurrences[2:]:
                raw_findings.append(
                    Finding(
                        rule_id="RHYTHM_REPEATED_SENTENCE_OPENER",
                        category="rhythm",
                        message=f"Sentence opener '{opener}' repeated {len(occurrences)} times",
                        start=occ_start,
                        end=occ_end,
                        quote=text[occ_start:occ_end],
                        points=rep_weight,
                    )
                )

    if len(paragraphs) >= 3:
        p_lens = [len(p[2]) for p in paragraphs]
        mean_p = sum(p_lens) / len(p_lens)
        if mean_p >= 100:
            var_p = sum((x - mean_p) ** 2 for x in p_lens) / len(p_lens)
            std_p = math.sqrt(var_p)
            if std_p < 25.0:
                p_weight = weights.get("rhythm_uniform_paragraphs", 6)
                raw_findings.append(
                    Finding(
                        rule_id="RHYTHM_UNIFORM_PARAGRAPHS",
                        category="rhythm",
                        message=f"Uniform paragraph lengths (character count std dev {std_p:.1f} < 25.0)",
                        start=paragraphs[0][0],
                        end=paragraphs[-1][1],
                        quote=text[paragraphs[0][0] : paragraphs[-1][1]],
                        points=p_weight,
                    )
                )

    # 6. VERIFY EXACT QUOTES
    verified_raw: List[Finding] = []
    for f in raw_findings:
        actual_slice = text[f.start : f.end]
        if actual_slice == f.quote:
            verified_raw.append(f)
        else:
            loc = text.find(f.quote, max(0, f.start - 5))
            if loc != -1:
                verified_raw.append(
                    Finding(
                        rule_id=f.rule_id,
                        category=f.category,
                        message=f.message,
                        start=loc,
                        end=loc + len(f.quote),
                        quote=f.quote,
                        points=f.points,
                    )
                )

    # 7. MERGE OVERLAPPING OR IDENTICAL SPANS (Fix 1)
    # Global multi-paragraph rhythm rules are exempt from local span conflict resolution
    GLOBAL_EXEMPT_RULES = {
        "RHYTHM_ONE_SENTENCE_PARAGRAPHS",
        "RHYTHM_EQUAL_SENTENCE_LENGTHS",
        "RHYTHM_UNIFORM_PARAGRAPHS",
        "STRUCT_HOOK_3_BULLETS_QUESTION_TEMPLATE",
    }

    local_findings = [f for f in verified_raw if f.rule_id not in GLOBAL_EXEMPT_RULES]
    global_findings = [f for f in verified_raw if f.rule_id in GLOBAL_EXEMPT_RULES]

    # Sort local findings by points descending, then by span length descending
    # This guarantees highest weight finding per span is accepted first
    sorted_local = sorted(
        local_findings,
        key=lambda f: (f.points, (f.end - f.start)),
        reverse=True,
    )

    accepted_spans: List[Tuple[int, int]] = []
    processed_local: List[Finding] = []

    for f in sorted_local:
        has_overlap = False
        for s, e in accepted_spans:
            if max(f.start, s) < min(f.end, e):
                has_overlap = True
                break

        if not has_overlap and f.points > 0:
            accepted_spans.append((f.start, f.end))
            processed_local.append(f)
        else:
            if has_overlap and f.points > 0:
                # Suppress points and add note
                suppressed_f = Finding(
                    rule_id=f.rule_id,
                    category=f.category,
                    message=f"{f.message} (Overlapped by higher-weight finding; points suppressed)",
                    start=f.start,
                    end=f.end,
                    quote=f.quote,
                    points=0,
                )
                processed_local.append(suppressed_f)
            else:
                processed_local.append(f)

    # Recombine all findings ordered by start position
    all_final_findings = sorted(
        processed_local + global_findings,
        key=lambda f: (f.start, -f.points),
    )

    # 8. COMPUTE CATEGORY SCORES & FINAL DETERMINISTIC SCORE
    cat_scores = {
        "banned_word": 0,
        "banned_phrase": 0,
        "punctuation": 0,
        "structure": 0,
        "rhythm": 0,
    }
    for f in all_final_findings:
        if f.points > 0:
            cat_scores[f.category] = cat_scores.get(f.category, 0) + f.points

    capped_banned_words = min(banned_words_cap, cat_scores["banned_word"])
    capped_banned_phrases = min(banned_phrases_cap, cat_scores["banned_phrase"])
    capped_punct = min(punctuation_cap, cat_scores["punctuation"])
    capped_struct = min(structure_cap, cat_scores["structure"])
    capped_rhythm = min(rhythm_cap, cat_scores["rhythm"])

    final_cat_scores = {
        "banned_word": capped_banned_words,
        "banned_phrase": capped_banned_phrases,
        "punctuation": capped_punct,
        "structure": capped_struct,
        "rhythm": capped_rhythm,
    }

    raw_total = (
        capped_banned_words
        + capped_banned_phrases
        + capped_punct
        + capped_struct
        + capped_rhythm
    )
    final_score = min(max_score, raw_total)

    return ScanResult(
        deterministic_score=final_score,
        category_scores=final_cat_scores,
        findings=all_final_findings,
    )
