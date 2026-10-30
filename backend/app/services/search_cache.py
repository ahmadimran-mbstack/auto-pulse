"""Search result caching per user, query hash, and date.
Guarantees per-user isolation and saves search quota.
"""
import datetime
import hashlib
import json
import logging
from typing import Dict, List, Optional
from app.core.limiter import get_redis_client
from app.services.search import Candidate

logger = logging.getLogger(__name__)

# In-memory fallback cache when Redis is not running
_IN_MEMORY_SEARCH_CACHE: Dict[str, str] = {}
SEARCH_CACHE_TTL_SECONDS = 86400  # 24 hours


def build_search_cache_key(user_id: str, query: str, date_str: Optional[str] = None) -> str:
    """Builds cache key: search:{user_id}:{query_hash}:{date}."""
    clean_query = query.strip().lower()
    query_hash = hashlib.sha256(clean_query.encode("utf-8")).hexdigest()[:12]
    d_str = date_str or datetime.date.today().isoformat()
    return f"search:{user_id}:{query_hash}:{d_str}"


def get_cached_search(user_id: str, query: str, date_str: Optional[str] = None) -> Optional[List[Candidate]]:
    """Checks Redis and in-memory cache for existing search results."""
    key = build_search_cache_key(user_id, query, date_str)

    # 1. Check Redis
    redis_client = get_redis_client()
    if redis_client:
        try:
            cached_val = redis_client.get(key)
            if cached_val:
                data = json.loads(cached_val)
                return [Candidate(**item) for item in data]
        except Exception as exc:
            logger.warning(f"Redis get failed for search key {key}: {exc}")

    # 2. Check in-memory fallback
    if key in _IN_MEMORY_SEARCH_CACHE:
        try:
            data = json.loads(_IN_MEMORY_SEARCH_CACHE[key])
            return [Candidate(**item) for item in data]
        except Exception as exc:
            logger.warning(f"In-memory search cache decode failed for {key}: {exc}")

    return None


def set_cached_search(user_id: str, query: str, candidates: List[Candidate], date_str: Optional[str] = None) -> None:
    """Saves search results in Redis (with TTL) and in-memory fallback."""
    key = build_search_cache_key(user_id, query, date_str)
    serialized = json.dumps([c.model_dump() for c in candidates])

    # 1. Save to Redis
    redis_client = get_redis_client()
    if redis_client:
        try:
            redis_client.setex(key, SEARCH_CACHE_TTL_SECONDS, serialized)
        except Exception as exc:
            logger.warning(f"Redis setex failed for search key {key}: {exc}")

    # 2. Save to in-memory fallback
    _IN_MEMORY_SEARCH_CACHE[key] = serialized
