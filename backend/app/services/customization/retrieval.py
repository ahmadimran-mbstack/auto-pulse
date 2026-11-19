"""Per-topic embedding retrieval (pgvector + MMR) with deterministic fallback."""

import logging
import time
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.customization import CustomizationFact, CustomizationPostSample
from app.services.customization.compiler import CustomizationContext
from app.services.embeddings import cosine_similarity, get_embedding_provider

logger = logging.getLogger(__name__)


def _mmr_select(
    candidates: List[Dict[str, Any]],
    top_k: int,
    lambda_mult: float = 0.7,
) -> List[Dict[str, Any]]:
    """Maximal Marginal Relevance selection over candidates that include 'sim' and 'embedding'."""
    if len(candidates) <= top_k:
        return candidates

    selected: List[Dict[str, Any]] = []
    remaining = list(candidates)

    while remaining and len(selected) < top_k:
        best_idx = 0
        best_score = -1e9
        for i, cand in enumerate(remaining):
            rel = float(cand.get("sim", 0.0))
            if not selected or cand.get("embedding") is None:
                div = 0.0
            else:
                div = max(
                    cosine_similarity(cand["embedding"], s["embedding"])
                    for s in selected
                    if s.get("embedding") is not None
                )
            mmr = lambda_mult * rel - (1.0 - lambda_mult) * div
            if mmr > best_score:
                best_score = mmr
                best_idx = i
        selected.append(remaining.pop(best_idx))
    return selected


def _fallback_result(context: CustomizationContext, query: str) -> Dict[str, Any]:
    g = context.guidance
    return {
        "query": query,
        "facts": list(g.business_facts[: settings.RETRIEVAL_FACTS_TOP_K]),
        "experiences": list(g.documented_experiences[:3]),
        "exemplars": [e.model_dump() for e in g.exemplars[: settings.RETRIEVAL_EXEMPLARS_TOP_K]],
        "fallback": True,
        "latency_ms": 0,
    }


def retrieve_for_topic(
    user_id: str,
    topic_label: str,
    angle: str,
    why_now: str,
    context: CustomizationContext,
    db: Optional[Session] = None,
) -> Dict[str, Any]:
    """Retrieve topic-relevant business facts, documented experiences, and style exemplars."""
    query = f"{topic_label}. {angle}. {why_now}".strip()
    if (
        context.is_empty
        or not settings.RETRIEVAL_ENABLED
        or not context.guidance.retrieval_ready
    ):
        return _fallback_result(context, query)

    provider = get_embedding_provider()
    if provider is None:
        return _fallback_result(context, query)

    t0 = time.perf_counter()
    try:
        q_vec = provider.embed_query(query)
    except Exception as exc:
        logger.warning(f"Embedding query failed for user {user_id}; using fallback: {exc}")
        return _fallback_result(context, query)

    should_close = False
    if db is None:
        db = SessionLocal()
        should_close = True

    try:
        model_id = provider.model_id
        min_sim = float(settings.RETRIEVAL_MIN_SIMILARITY)

        # 1. Business facts (over-fetch 24 -> filter -> MMR -> + core facts)
        fact_rows = (
            db.query(
                CustomizationFact,
                (1.0 - CustomizationFact.embedding.cosine_distance(q_vec)).label("sim"),
            )
            .filter(
                CustomizationFact.user_id == user_id,
                CustomizationFact.removed.is_(False),
                CustomizationFact.kind == "business_fact",
                CustomizationFact.embedding.isnot(None),
                CustomizationFact.embedding_model == model_id,
            )
            .order_by(CustomizationFact.embedding.cosine_distance(q_vec))
            .limit(24)
            .all()
        )

        fact_cands = []
        for row, sim in fact_rows:
            if float(sim or 0.0) >= min_sim:
                fact_cands.append(
                    {
                        "id": str(row.id),
                        "category": row.category,
                        "text": row.text,
                        "numbers": list(row.numbers or []),
                        "source_label": row.source_label,
                        "is_core": row.is_core,
                        "sim": round(float(sim), 4),
                        "embedding": list(row.embedding) if row.embedding is not None else None,
                    }
                )

        selected_facts = _mmr_select(fact_cands, top_k=settings.RETRIEVAL_FACTS_TOP_K)
        selected_ids = {f["id"] for f in selected_facts}

        # Always include core facts
        for cf in context.guidance.business_facts:
            if cf.get("is_core") and cf["id"] not in selected_ids:
                selected_facts.append({**cf, "sim": 1.0})
                selected_ids.add(cf["id"])

        for f in selected_facts:
            f.pop("embedding", None)

        # 2. Documented experiences (sim >= 0.5, top 3)
        exp_rows = (
            db.query(
                CustomizationFact,
                (1.0 - CustomizationFact.embedding.cosine_distance(q_vec)).label("sim"),
            )
            .filter(
                CustomizationFact.user_id == user_id,
                CustomizationFact.removed.is_(False),
                CustomizationFact.kind == "documented_experience",
                CustomizationFact.embedding.isnot(None),
                CustomizationFact.embedding_model == model_id,
            )
            .order_by(CustomizationFact.embedding.cosine_distance(q_vec))
            .limit(6)
            .all()
        )
        experiences = [
            {
                "id": str(row.id),
                "text": row.text,
                "numbers": list(row.numbers or []),
                "source_label": row.source_label,
                "sim": round(float(sim), 4),
            }
            for row, sim in exp_rows
            if float(sim or 0.0) >= 0.5
        ][:3]

        # 3. Exemplars (pinned first, then 0.6*topic_sim + 0.4*typicality, max 1/doc)
        sample_rows = (
            db.query(
                CustomizationPostSample,
                (1.0 - CustomizationPostSample.embedding.cosine_distance(q_vec)).label("sim"),
            )
            .filter(
                CustomizationPostSample.user_id == user_id,
                CustomizationPostSample.excluded.is_(False),
                CustomizationPostSample.embedding.isnot(None),
                CustomizationPostSample.embedding_model == model_id,
            )
            .order_by(CustomizationPostSample.embedding.cosine_distance(q_vec))
            .limit(15)
            .all()
        )

        scored_samples = []
        for s, sim in sample_rows:
            if s.quality_flag == "not_a_post":
                continue
            typicality = max(0.0, 1.0 - abs(s.char_count - 950) / 1500.0)
            blended = 0.6 * float(sim or 0.0) + 0.4 * typicality
            scored_samples.append((s, blended))
        scored_samples.sort(key=lambda item: (not item[0].pinned, -item[1]))

        exemplars: List[Dict[str, Any]] = []
        seen_docs = set()
        ex_chars = 0
        for s, _score in scored_samples:
            did = str(s.document_id)
            if not s.pinned and did in seen_docs:
                continue
            if ex_chars + len(s.text) > 6000 and exemplars:
                continue
            exemplars.append(
                {
                    "id": str(s.id),
                    "document_id": did,
                    "text": s.text,
                    "char_count": s.char_count,
                    "pinned": s.pinned,
                }
            )
            seen_docs.add(did)
            ex_chars += len(s.text)
            if len(exemplars) >= settings.RETRIEVAL_EXEMPLARS_TOP_K:
                break

        if not exemplars:
            exemplars = [e.model_dump() for e in context.guidance.exemplars[: settings.RETRIEVAL_EXEMPLARS_TOP_K]]

        latency_ms = int((time.perf_counter() - t0) * 1000)
        return {
            "query": query,
            "facts": selected_facts,
            "experiences": experiences,
            "exemplars": exemplars,
            "fallback": False,
            "latency_ms": latency_ms,
        }
    except Exception as exc:
        logger.warning(f"Retrieval query failed for {user_id}; using fallback: {exc}")
        return _fallback_result(context, query)
    finally:
        if should_close:
            db.close()
