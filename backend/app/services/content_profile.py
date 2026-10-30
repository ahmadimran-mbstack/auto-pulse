"""Content profile service for AutoPulse creators.
Extracts, structures, caches, and defaults user content preferences.
"""
import json
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session

from app.core.limiter import get_redis_client
from app.db.session import SessionLocal
from app.models.profile import Profile

logger = logging.getLogger(__name__)

# In-memory fallback cache when Redis is unavailable
_IN_MEMORY_CONTENT_PROFILE_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 86400  # 24 hours


def _derive_default_goals(role: Optional[str], industry: Optional[str], tone: Optional[str]) -> str:
    role_str = role or "technology leader"
    ind_str = industry or "software engineering"
    return f"Establish domain authority as a {role_str} in {ind_str}, share practical engineering insights, and build high-signal engagement with peers."


def _derive_default_location(timezone: Optional[str]) -> str:
    if not timezone:
        return "Global / Remote"
    tz = timezone.replace("_", " ")
    if "/" in tz:
        parts = tz.split("/")
        return f"{parts[1]} ({parts[0]})"
    return tz


def build_default_content_profile(user_id: str, profile: Optional[Profile] = None) -> Dict[str, Any]:
    """Builds a clean content profile dictionary with reliable defaults so the pipeline never crashes."""
    role_title = (getattr(profile, "role_title", None) or "").strip() or "Technology Leader"
    industry = (getattr(profile, "industry", None) or "").strip() or "Software Engineering"
    niche_description = (getattr(profile, "niche_description", None) or "").strip() or f"Practitioner insights, system design trade-offs, and technical lessons in {industry}."
    audience = (getattr(profile, "audience", None) or "").strip() or "Engineering leaders, software architects, and technical decision makers"
    tone = (getattr(profile, "tone", None) or "").strip() or "direct"

    topics_include = [t.strip() for t in (getattr(profile, "topics_include", None) or []) if t and t.strip()]
    if not topics_include:
        topics_include = [industry, "System Architecture", "Production Reliability"]

    topics_avoid = [t.strip() for t in (getattr(profile, "topics_avoid", None) or []) if t and t.strip()]

    voice_notes = (getattr(profile, "voice_notes", None) or "").strip() or "Analytical, practitioner-first, grounded in concrete trade-offs, zero fluff."
    sample_posts = (getattr(profile, "sample_posts", None) or "").strip()
    display_name = (getattr(profile, "display_name", None) or "").strip() or "Creator"
    brand_name = (getattr(profile, "brand_name", None) or "").strip() or "AutoPulse"
    timezone = (getattr(profile, "timezone", None) or "").strip() or "UTC"

    # Fields currently missing from profiles table schema:
    goals = _derive_default_goals(role_title, industry, tone)
    location = _derive_default_location(timezone)
    language = "English"

    return {
        "user_id": user_id,
        "display_name": display_name,
        "role_title": role_title,
        "industry": industry,
        "niche_description": niche_description,
        "audience": audience,
        "goals": goals,
        "tone": tone,
        "topics_include": topics_include,
        "topics_avoid": topics_avoid,
        "voice_notes": voice_notes,
        "sample_posts": sample_posts,
        "location": location,
        "language": language,
        "brand_name": brand_name,
        "brand_primary_hex": getattr(profile, "brand_primary_hex", None) or "#0F172A",
        "brand_accent_hex": getattr(profile, "brand_accent_hex", None) or "#38BDF8",
        "timezone": timezone,
    }


def get_content_profile(user_id: str, db: Optional[Session] = None) -> Dict[str, Any]:
    """Returns the cached content profile for user_id, or builds it from DB and caches it.
    Uses Redis when connected, falling back to an in-memory dictionary.
    """
    cache_key = f"content_profile:{user_id}"

    # 1. Check Redis cache
    redis_client = get_redis_client()
    if redis_client:
        try:
            cached_raw = redis_client.get(cache_key)
            if cached_raw:
                return json.loads(cached_raw)
        except Exception as exc:
            logger.warning(f"Redis get failed for {cache_key}: {exc}")

    # 2. Check in-memory fallback
    if cache_key in _IN_MEMORY_CONTENT_PROFILE_CACHE:
        return _IN_MEMORY_CONTENT_PROFILE_CACHE[cache_key]

    # 3. Load from DB
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        profile = db.query(Profile).filter(Profile.user_id == user_id).first()
        content_profile = build_default_content_profile(user_id=user_id, profile=profile)
    finally:
        if should_close:
            db.close()

    # 4. Save to Redis
    if redis_client:
        try:
            redis_client.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(content_profile))
        except Exception as exc:
            logger.warning(f"Redis setex failed for {cache_key}: {exc}")

    # 5. Save to in-memory fallback
    _IN_MEMORY_CONTENT_PROFILE_CACHE[cache_key] = content_profile

    return content_profile


def invalidate_content_profile_cache(user_id: str) -> None:
    """Invalidates the cached content profile for a user across Redis and memory."""
    cache_key = f"content_profile:{user_id}"

    # Invalidate in-memory fallback
    _IN_MEMORY_CONTENT_PROFILE_CACHE.pop(cache_key, None)

    # Invalidate Redis
    redis_client = get_redis_client()
    if redis_client:
        try:
            redis_client.delete(cache_key)
            logger.info(f"Invalidated Redis cache for {cache_key}")
        except Exception as exc:
            logger.warning(f"Redis delete failed for {cache_key}: {exc}")

