"""EffectivePolicy and MachineConstraint models with safe platform clamping."""

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field

# LinkedIn & safety hard bounds (cannot be overridden by user playbooks or instructions)
PLATFORM_MIN_CHARS = 300
PLATFORM_MAX_CHARS = 2900
PLATFORM_MIN_RANGE_SPAN = 150
PLATFORM_MAX_FIRST_LINE = 210
PLATFORM_MAX_HASHTAGS = 5


class MachineConstraint(BaseModel):
    """Structured hard constraint extracted from a playbook or custom instructions."""

    type: Literal[
        "length_chars",
        "first_line_max_chars",
        "paragraph_count",
        "hashtag_count",
        "hashtag_case",
        "emoji_policy",
        "banned_phrase",
        "required_phrase_end",
        "required_phrase_start",
        "line_break_style",
        "bullet_style",
        "question_ending",
    ]
    min: Optional[int] = None
    max: Optional[int] = None
    value: Optional[str] = None


class EffectivePolicy(BaseModel):
    """Deterministic post constraints consumed by checks, evaluator, cleaner, and prompts."""

    length_min: int = 850
    length_max: int = 1200
    first_line_max: int = 140
    paragraphs_min: int = 3
    paragraphs_max: int = 6
    hashtags_in_body: bool = True
    hashtags_min: int = 1
    hashtags_max: int = 3
    first_comment_hashtags_max: int = 3
    hashtag_case: Literal["camel", "lower", "any"] = "camel"
    emoji_policy: Literal["none", "sparse", "allowed", "many"] = "none"
    emoji_max_count: Optional[int] = None
    allow_markdown_bullets: bool = False
    banned_phrases_extra: List[str] = Field(default_factory=list)
    required_end_phrase: Optional[str] = None
    required_start_phrase: Optional[str] = None
    question_ending: Literal["allowed", "required", "forbidden"] = "allowed"
    no_question_hooks: bool = False
    require_number_hook: bool = False
    length_by_post_type: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    allow_first_person_events: bool = False
    provenance: Dict[str, str] = Field(default_factory=dict)


def get_effective_policy(
    policy: Optional[Union[EffectivePolicy, Dict[str, Any]]] = None,
) -> EffectivePolicy:
    """Coerce None, dict, or EffectivePolicy into an EffectivePolicy instance."""
    if policy is None:
        return EffectivePolicy()
    if isinstance(policy, EffectivePolicy):
        return policy
    if isinstance(policy, dict):
        return EffectivePolicy.model_validate(policy)
    return EffectivePolicy()


def clamp_policy(policy: EffectivePolicy) -> tuple[EffectivePolicy, List[str]]:
    """Clamp an EffectivePolicy to LinkedIn platform and safety bounds.
    Returns (clamped_policy, warnings).
    """
    warnings: List[str] = []
    data = policy.model_dump()

    lmin = max(PLATFORM_MIN_CHARS, min(PLATFORM_MAX_CHARS - PLATFORM_MIN_RANGE_SPAN, int(data["length_min"])))
    lmax = min(PLATFORM_MAX_CHARS, max(lmin + PLATFORM_MIN_RANGE_SPAN, int(data["length_max"])))
    if lmin != data["length_min"] or lmax != data["length_max"]:
        warnings.append(
            f"Clamped length bounds from {data['length_min']}–{data['length_max']} to {lmin}–{lmax} (platform limits)."
        )
    data["length_min"] = lmin
    data["length_max"] = lmax

    flm = max(40, min(PLATFORM_MAX_FIRST_LINE, int(data["first_line_max"])))
    if flm != data["first_line_max"]:
        warnings.append(f"Clamped first-line max from {data['first_line_max']} to {flm} chars.")
    data["first_line_max"] = flm

    pmin = max(1, min(15, int(data["paragraphs_min"])))
    pmax = max(pmin, min(20, int(data["paragraphs_max"])))
    data["paragraphs_min"] = pmin
    data["paragraphs_max"] = pmax

    hmin = max(0, min(PLATFORM_MAX_HASHTAGS, int(data["hashtags_min"])))
    hmax = max(hmin, min(PLATFORM_MAX_HASHTAGS, int(data["hashtags_max"])))
    if hmin != data["hashtags_min"] or hmax != data["hashtags_max"]:
        warnings.append(
            f"Clamped hashtag count from {data['hashtags_min']}–{data['hashtags_max']} to {hmin}–{hmax}."
        )
    data["hashtags_min"] = hmin
    data["hashtags_max"] = hmax

    # Deduplicate and normalize extra banned phrases
    seen_bp = set()
    clean_bp: List[str] = []
    for phrase in data.get("banned_phrases_extra") or []:
        p = str(phrase).strip()
        if p and p.lower() not in seen_bp:
            seen_bp.add(p.lower())
            clean_bp.append(p[:120])
    data["banned_phrases_extra"] = clean_bp[:50]

    if data.get("required_end_phrase"):
        data["required_end_phrase"] = str(data["required_end_phrase"]).strip()[:140] or None
    if data.get("required_start_phrase"):
        data["required_start_phrase"] = str(data["required_start_phrase"]).strip()[:140] or None

    fchm = max(0, min(PLATFORM_MAX_HASHTAGS, int(data.get("first_comment_hashtags_max", 3))))
    data["first_comment_hashtags_max"] = fchm

    if data.get("emoji_max_count") is not None:
        data["emoji_max_count"] = max(0, min(20, int(data["emoji_max_count"])))

    return EffectivePolicy.model_validate(data), warnings
