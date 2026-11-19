"""Cached CustomizationContext loader (Redis -> in-memory -> DB)."""

import json
import logging
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.limiter import get_redis_client
from app.db.session import SessionLocal
from app.models.customization import CustomizationSettings, CustomizationVersion
from app.services.customization.compiler import CustomizationContext

logger = logging.getLogger(__name__)

_IN_MEMORY_CUSTOMIZATION_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 86400


def get_customization_context(
    user_id: str, db: Optional[Session] = None
) -> CustomizationContext:
    """Return active compiled CustomizationContext for user_id, or empty context on miss/error."""
    if not settings.is_customization_enabled_for(user_id):
        return CustomizationContext(is_empty=True)

    cache_key = f"customization_ctx:{user_id}"

    # 1. Redis cache
    redis_client = get_redis_client()
    if redis_client:
        try:
            cached_raw = redis_client.get(cache_key)
            if cached_raw:
                return CustomizationContext.model_validate(json.loads(cached_raw))
        except Exception as exc:
            logger.warning(f"Redis get failed for {cache_key}: {exc}")

    # 2. In-memory cache
    if cache_key in _IN_MEMORY_CUSTOMIZATION_CACHE:
        try:
            return CustomizationContext.model_validate(_IN_MEMORY_CUSTOMIZATION_CACHE[cache_key])
        except Exception:
            pass

    # 3. Load from DB
    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    ctx = CustomizationContext(is_empty=True)
    try:
        settings_row = (
            db.query(CustomizationSettings)
            .filter(CustomizationSettings.user_id == user_id)
            .first()
        )
        if settings_row and settings_row.active_version_id:
            ver = (
                db.query(CustomizationVersion)
                .filter(
                    CustomizationVersion.id == settings_row.active_version_id,
                    CustomizationVersion.user_id == user_id,
                )
                .first()
            )
            if ver and ver.compiled:
                ctx = CustomizationContext.model_validate(ver.compiled)
                ctx.version_id = str(ver.id)
                ctx.version = ver.version
    except Exception as exc:
        logger.warning(f"Failed loading customization context for {user_id}: {exc}")
        return CustomizationContext(is_empty=True)
    finally:
        if should_close:
            db.close()

    dumped = ctx.model_dump()
    if redis_client:
        try:
            redis_client.setex(cache_key, CACHE_TTL_SECONDS, json.dumps(dumped))
        except Exception as exc:
            logger.warning(f"Redis setex failed for {cache_key}: {exc}")

    _IN_MEMORY_CUSTOMIZATION_CACHE[cache_key] = dumped
    return ctx


def invalidate_customization_context_cache(user_id: str) -> None:
    cache_key = f"customization_ctx:{user_id}"
    _IN_MEMORY_CUSTOMIZATION_CACHE.pop(cache_key, None)
    redis_client = get_redis_client()
    if redis_client:
        try:
            redis_client.delete(cache_key)
        except Exception as exc:
            logger.warning(f"Redis delete failed for {cache_key}: {exc}")
