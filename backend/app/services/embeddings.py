"""Embedding provider abstraction and Hugging Face Inference API client."""

import hashlib
import logging
import math
import time
from typing import List, Optional, Protocol

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingError(RuntimeError):
    """Raised when embedding generation fails."""


class EmbeddingConfigError(EmbeddingError):
    """Raised when the returned embedding dimension does not match EMBEDDING_DIM."""


class EmbeddingProvider(Protocol):
    model_id: str
    dim: int

    def embed_documents(self, texts: List[str]) -> List[List[float]]: ...
    def embed_query(self, text: str) -> List[float]: ...


def _l2_normalize(vec: List[float]) -> List[float]:
    norm = math.sqrt(sum(x * x for x in vec))
    if norm <= 1e-12:
        return vec
    return [x / norm for x in vec]


def cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na <= 1e-12 or nb <= 1e-12:
        return 0.0
    return dot / (na * nb)


class HFInferenceEmbeddings:
    """Hugging Face Inference Providers (hf-inference) feature-extraction client."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_id: Optional[str] = None,
        base_url: Optional[str] = None,
        dim: Optional[int] = None,
        batch_size: Optional[int] = None,
        timeout_seconds: Optional[int] = None,
        query_prefix: Optional[str] = None,
    ):
        self.api_key = api_key or settings.HF_EMBEDDING_API_KEY or ""
        self.model_id = model_id or settings.HF_EMBEDDING_MODEL
        self.base_url = (base_url or settings.HF_EMBEDDING_BASE_URL).rstrip("/")
        self.dim = dim or settings.EMBEDDING_DIM
        self.batch_size = max(1, batch_size or settings.EMBEDDING_BATCH_SIZE)
        self.timeout_seconds = float(timeout_seconds or settings.EMBEDDING_TIMEOUT_SECONDS)
        self.query_prefix = (
            query_prefix if query_prefix is not None else settings.EMBEDDING_QUERY_PREFIX
        )
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0

    def _endpoint(self) -> str:
        return f"{self.base_url}/{self.model_id}/pipeline/feature-extraction"

    def _check_circuit(self) -> None:
        if time.time() < self._circuit_open_until:
            raise EmbeddingError("Embedding circuit breaker is open")

    def _record_success(self) -> None:
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0

    def _record_failure(self) -> None:
        self._consecutive_failures += 1
        if self._consecutive_failures >= 5:
            self._circuit_open_until = time.time() + 60.0

    def _call_batch(self, texts: List[str]) -> List[List[float]]:
        self._check_circuit()
        if not self.api_key:
            raise EmbeddingConfigError("HF_EMBEDDING_API_KEY is not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": texts,
            "options": {"wait_for_model": True},
        }

        last_exc: Optional[Exception] = None
        for attempt in range(3):
            try:
                with httpx.Client(timeout=self.timeout_seconds) as client:
                    resp = client.post(self._endpoint(), headers=headers, json=payload)

                if resp.status_code in (429, 503):
                    retry_after = float(resp.headers.get("Retry-After", "0") or 0)
                    try:
                        est = float((resp.json() or {}).get("estimated_time", 0) or 0)
                    except Exception:
                        est = 0.0
                    wait = min(10.0, max(1.0 * (2**attempt), retry_after, min(est, 5.0)))
                    if attempt < 2:
                        time.sleep(wait)
                        continue
                    self._record_failure()
                    raise EmbeddingError(f"HF embedding HTTP {resp.status_code}: {resp.text[:200]}")

                if resp.status_code >= 400:
                    self._record_failure()
                    raise EmbeddingError(f"HF embedding HTTP {resp.status_code}: {resp.text[:200]}")

                data = resp.json()
                # Single input can return 1D vector; batch returns 2D list of vectors
                if data and isinstance(data[0], (int, float)):
                    vectors = [data]
                else:
                    vectors = data

                if len(vectors) != len(texts):
                    raise EmbeddingError(
                        f"HF embedding count mismatch: expected {len(texts)}, got {len(vectors)}"
                    )

                normalized: List[List[float]] = []
                for vec in vectors:
                    if not isinstance(vec, list) or len(vec) != self.dim:
                        got = len(vec) if isinstance(vec, list) else type(vec).__name__
                        raise EmbeddingConfigError(
                            f"Embedding dimension mismatch for {self.model_id}: expected {self.dim}, got {got}"
                        )
                    normalized.append(_l2_normalize([float(x) for x in vec]))

                self._record_success()
                return normalized
            except EmbeddingConfigError:
                raise
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    time.sleep(1.0 * (2**attempt))

        self._record_failure()
        raise EmbeddingError(f"HF embedding failed after retries: {last_exc}") from last_exc

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        out: List[List[float]] = []
        for i in range(0, len(texts), self.batch_size):
            batch = [t[:8000] if t else " " for t in texts[i : i + self.batch_size]]
            out.extend(self._call_batch(batch))
        return out

    def embed_query(self, text: str) -> List[float]:
        prefixed = f"{self.query_prefix}{text}" if self.query_prefix else text
        return self.embed_documents([prefixed])[0]


class FakeEmbeddings:
    """Deterministic hash-based unit-norm embeddings for tests."""

    def __init__(self, model_id: str = "fake-embed-v1", dim: int = 384):
        self.model_id = model_id
        self.dim = dim

    def _vec(self, text: str) -> List[float]:
        # Word-bag + hash projection so texts sharing words have higher cosine similarity
        vec = [0.0] * self.dim
        tokens = [t.lower() for t in (text or "").split() if t.strip()]
        if not tokens:
            tokens = ["_empty_"]
        for tok in tokens:
            h = hashlib.sha256(tok.encode("utf-8")).digest()
            idx = int.from_bytes(h[:2], "big") % self.dim
            sign = 1.0 if (h[2] % 2 == 0) else -1.0
            vec[idx] += sign
        return _l2_normalize(vec)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> List[float]:
        return self._vec(text)


_EMBEDDING_PROVIDER: Optional[EmbeddingProvider] = None


def get_embedding_provider() -> Optional[EmbeddingProvider]:
    global _EMBEDDING_PROVIDER
    if _EMBEDDING_PROVIDER is not None:
        return _EMBEDDING_PROVIDER
    if not settings.HF_EMBEDDING_API_KEY:
        return None
    _EMBEDDING_PROVIDER = HFInferenceEmbeddings()
    return _EMBEDDING_PROVIDER


def reset_embedding_provider_for_tests(provider: Optional[EmbeddingProvider] = None) -> None:
    global _EMBEDDING_PROVIDER
    _EMBEDDING_PROVIDER = provider
