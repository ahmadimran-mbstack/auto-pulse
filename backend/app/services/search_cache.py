"""Search result caching per user and query hash.
Guarantees per-user isolation and saves search quota for scheduled runs.
Manual runs bypass this layer completely to ensure variety.
"""
import hashlib
import json
import logging
import time
from typing import Dict, List, Optional, Tuple
from app.core.limiter import get_redis_client
from app.services.search import Candidate

logger = logging.getLogger(__name__)

# In-memory fallback cache with timestamp expiry: key -> (expire_timestamp, serialized_json)
_IN_MEMORY_SEARCH_CACHE: Dict[str, Tuple[float, str]] = {}
SEARCH_CACHE_TTL_SECONDS = 600  # 10 minutes maximum per user requirements


def build_search_cache_key(user_id: str, query: str, date_str: Optional[str] = None) -> str:
    """Builds cache key: search:{user_id}:{query_hash}.
    Strictly isolated per user_id and query content.
    """
    clean_query = query.strip().lower()
    query_hash = hashlib.sha256(clean_query.encode("utf-8")).hexdigest()[:12]
    return f"search:{user_id}:{query_hash}"


def get_cached_search(user_id: str, query: str, date_str: Optional[str] = None) -> Optional[List[Candidate]]:
    """Checks Redis and in-memory cache for existing search results with a maximum 10-minute TTL."""
    key = build_search_cache_key(user_id, query, date_str)

    # 1. Check Redis
    redis_client = get_redis_client()
    if redis_client:
        try:
            cached_val = redis_client.get(key)
            if cached_val:
                logger.info(f"[CACHE HIT] Reusing cached search result for user {user_id}, query='{query}' (key={key})")
                data = json.loads(cached_val)
                return [Candidate(**item) for item in data]
        except Exception as exc:
            logger.warning(f"Redis get failed for search key {key}: {exc}")

    # 2. Check in-memory fallback
    now = time.time()
    if key in _IN_MEMORY_SEARCH_CACHE:
        expire_at, payload = _IN_MEMORY_SEARCH_CACHE[key]
        if now < expire_at:
            try:
                logger.info(f"[CACHE HIT] Reusing in-memory cached search result for user {user_id}, query='{query}' (key={key})")
                data = json.loads(payload)
                return [Candidate(**item) for item in data]
            except Exception as exc:
                logger.warning(f"In-memory search cache decode failed for {key}: {exc}")
        else:
            # Expired: clean up
            _IN_MEMORY_SEARCH_CACHE.pop(key, None)

    logger.info(f"[CACHE MISS] No cached search result found for user {user_id}, query='{query}' (key={key})")
    return None


def set_cached_search(user_id: str, query: str, candidates: List[Candidate], date_str: Optional[str] = None) -> None:
    """Saves search results in Redis (with short 10m TTL) and in-memory fallback with timestamp expiry."""
    key = build_search_cache_key(user_id, query, date_str)
    serialized = json.dumps([c.model_dump() for c in candidates])
    now = time.time()

    # 1. Save to Redis
    redis_client = get_redis_client()
    if redis_client:
        try:
            redis_client.setex(key, SEARCH_CACHE_TTL_SECONDS, serialized)
        except Exception as exc:
            logger.warning(f"Redis setex failed for search key {key}: {exc}")

    # 2. Save to in-memory fallback with expiration timestamp
    _IN_MEMORY_SEARCH_CACHE[key] = (now + SEARCH_CACHE_TTL_SECONDS, serialized)
