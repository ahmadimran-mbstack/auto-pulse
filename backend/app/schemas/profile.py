import datetime
import re
from typing import Any, List, Optional
import zoneinfo
from pydantic import BaseModel, ConfigDict, field_validator

# DAY 4: these texts will go into LLM prompts, treat them as untrusted input

HEX_COLOR_REGEX = re.compile(r"^#[0-9A-Fa-f]{6}$")
ALLOWED_TONES = {"professional", "friendly", "direct", "educational", "inspiring"}


# Helper to check for illegal control characters
def _reject_control_characters(text_value: str, allow_newlines: bool = False) -> None:
    for char in text_value:
        code = ord(char)
        if allow_newlines and char in ("\n", "\r", "\t"):
            continue
        if code < 32 or code == 127:
            raise ValueError("Control characters are not allowed.")


# Helper to trim strings, convert blanks to None, and check control characters
def _clean_text_field(
    value: Any,
    max_length: Optional[int] = None,
    allow_newlines: bool = False,
    min_length: Optional[int] = None,
) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Must be a text string.")
    trimmed = value.strip()
    if not trimmed:
        return None
    _reject_control_characters(trimmed, allow_newlines=allow_newlines)
    if min_length is not None and len(trimmed) < min_length:
        raise ValueError(f"Use at least {min_length} characters.")
    if max_length is not None and len(trimmed) > max_length:
        raise ValueError(f"Use at most {max_length} characters.")
    return trimmed


# Helper to sanitize and deduplicate topic lists
def _clean_topic_list(items: Any) -> List[str]:
    if items is None:
        return []
    if not isinstance(items, list):
        raise ValueError("Must be a list of topics.")
    cleaned: List[str] = []
    seen: set[str] = set()
    for raw_item in items:
        if not isinstance(raw_item, str):
            raise ValueError("Each topic must be a text string.")
        trimmed = raw_item.strip()
        if not trimmed:
            continue
        _reject_control_characters(trimmed, allow_newlines=False)
        if len(trimmed) > 40:
            raise ValueError("Each topic must be 40 characters or fewer.")
        lower = trimmed.lower()
        if lower not in seen:
            seen.add(lower)
            cleaned.append(trimmed)
    if len(cleaned) > 10:
        raise ValueError("You can provide at most 10 topics.")
    return cleaned


# Step 1 request model: niche, role, audience, topics
class OnboardingStep1Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role_title: Optional[str] = None
    industry: Optional[str] = None
    niche_description: Optional[str] = None
    audience: Optional[str] = None
    topics_include: List[str] = []
    topics_avoid: List[str] = []

    @field_validator("role_title", mode="before")
    @classmethod
    def validate_role_title(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=80, allow_newlines=False)

    @field_validator("industry", mode="before")
    @classmethod
    def validate_industry(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=80, allow_newlines=False)

    @field_validator("niche_description", mode="before")
    @classmethod
    def validate_niche_description(cls, v: Any) -> Optional[str]:
        return _clean_text_field(
            v, min_length=20, max_length=500, allow_newlines=True
        )

    @field_validator("audience", mode="before")
    @classmethod
    def validate_audience(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=200, allow_newlines=False)

    @field_validator("topics_include", mode="before")
    @classmethod
    def validate_topics_include(cls, v: Any) -> List[str]:
        return _clean_topic_list(v)

    @field_validator("topics_avoid", mode="before")
    @classmethod
    def validate_topics_avoid(cls, v: Any) -> List[str]:
        return _clean_topic_list(v)


# Step 2 request model: voice and writing style
class OnboardingStep2Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tone: Optional[str] = None
    voice_notes: Optional[str] = None
    sample_posts: Optional[str] = None

    @field_validator("tone", mode="before")
    @classmethod
    def validate_tone(cls, v: Any) -> Optional[str]:
        cleaned = _clean_text_field(v, max_length=50, allow_newlines=False)
        if cleaned is None:
            return None
        if cleaned not in ALLOWED_TONES:
            raise ValueError(
                "Tone must be one of: professional, friendly, direct, educational, inspiring."
            )
        return cleaned

    @field_validator("voice_notes", mode="before")
    @classmethod
    def validate_voice_notes(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=500, allow_newlines=True)

    @field_validator("sample_posts", mode="before")
    @classmethod
    def validate_sample_posts(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=3000, allow_newlines=True)


# Step 3 request model: visual branding colors and name
class OnboardingStep3Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    brand_name: Optional[str] = None
    brand_primary_hex: Optional[str] = None
    brand_accent_hex: Optional[str] = None

    @field_validator("brand_name", mode="before")
    @classmethod
    def validate_brand_name(cls, v: Any) -> Optional[str]:
        return _clean_text_field(v, max_length=60, allow_newlines=False)

    @field_validator("brand_primary_hex", mode="before")
    @classmethod
    def validate_brand_primary_hex(cls, v: Any) -> Optional[str]:
        cleaned = _clean_text_field(v, max_length=7, allow_newlines=False)
        if cleaned is None:
            return None
        if not HEX_COLOR_REGEX.match(cleaned):
            raise ValueError("Brand primary color must be in #RRGGBB hex format.")
        return cleaned

    @field_validator("brand_accent_hex", mode="before")
    @classmethod
    def validate_brand_accent_hex(cls, v: Any) -> Optional[str]:
        cleaned = _clean_text_field(v, max_length=7, allow_newlines=False)
        if cleaned is None:
            return None
        if not HEX_COLOR_REGEX.match(cleaned):
            raise ValueError("Brand accent color must be in #RRGGBB hex format.")
        return cleaned


# Step 4 request model: scheduling and delivery preferences
class OnboardingStep4Request(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timezone: Optional[str] = None
    post_time: Optional[str] = None
    post_days: List[int] = []
    approval_method: str = "email"

    @field_validator("timezone", mode="before")
    @classmethod
    def validate_timezone(cls, v: Any) -> Optional[str]:
        cleaned = _clean_text_field(v, max_length=80, allow_newlines=False)
        if cleaned is None:
            return None
        try:
            zoneinfo.ZoneInfo(cleaned)
        except Exception:
            raise ValueError("Timezone must be a valid IANA timezone name.")
        return cleaned

    @field_validator("post_time", mode="before")
    @classmethod
    def validate_post_time(cls, v: Any) -> Optional[str]:
        cleaned = _clean_text_field(v, max_length=5, allow_newlines=False)
        if cleaned is None:
            return None
        try:
            parsed = datetime.datetime.strptime(cleaned, "%H:%M")
        except ValueError:
            raise ValueError("Post time must be in 24-hour HH:MM format.")
        return parsed.strftime("%H:%M")

    @field_validator("post_days", mode="before")
    @classmethod
    def validate_post_days(cls, v: Any) -> List[int]:
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("Post days must be a list of numbers.")
        cleaned: List[int] = []
        seen = set()
        for item in v:
            if not isinstance(item, int) or isinstance(item, bool):
                raise ValueError("Each post day must be an integer between 0 and 6.")
            if item < 0 or item > 6:
                raise ValueError(
                    "Post days must be integers between 0 (Monday) and 6 (Sunday)."
                )
            if item not in seen:
                seen.add(item)
                cleaned.append(item)
        return cleaned

    @field_validator("approval_method", mode="before")
    @classmethod
    def validate_approval_method(cls, v: Any) -> str:
        if v is None:
            raise ValueError("Approval method is required.")
        if not isinstance(v, str):
            raise ValueError("Approval method must be a string.")
        trimmed = v.strip()
        if trimmed != "email":
            raise ValueError("Approval method must be 'email'.")
        return "email"


# Full profile response returned to client (never includes user_id)
class ProfileResponse(BaseModel):
    display_name: Optional[str] = None
    role_title: Optional[str] = None
    industry: Optional[str] = None
    niche_description: Optional[str] = None
    audience: Optional[str] = None
    topics_include: List[str] = []
    topics_avoid: List[str] = []
    tone: Optional[str] = None
    voice_notes: Optional[str] = None
    sample_posts: Optional[str] = None
    brand_name: Optional[str] = None
    brand_primary_hex: Optional[str] = None
    brand_accent_hex: Optional[str] = None
    timezone: Optional[str] = None
    post_time: Optional[str] = None
    post_days: List[int] = []
    approval_method: str = "email"
    onboarding_step: int = 0
    onboarding_completed_at: Optional[datetime.datetime] = None
    onboarding_complete: bool = False
    created_at: datetime.datetime
    updated_at: datetime.datetime
