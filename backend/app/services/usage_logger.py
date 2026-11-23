"""Centralized token, search-call, and cost logger for llm_call_log."""

from contextlib import contextmanager
from contextvars import ContextVar
import logging
from typing import Any, Dict, Iterator, Optional, Tuple
import uuid

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.core.plans import compute_llm_cost_micro_usd, compute_search_cost_micro_usd
from app.db.session import SessionLocal
from app.models.usage import LLMCallLog

logger = logging.getLogger(__name__)

_usage_context: ContextVar[Optional[Dict[str, Any]]] = ContextVar("usage_context", default=None)


@contextmanager
def usage_logging_context(
    run_id: Optional[str],
    user_id: str,
    kind: str,
) -> Iterator[None]:
    """Bind run_id, user_id, and kind ('scheduled'|'playground') for downstream LLM/search calls."""
    parsed_run_id: Optional[uuid.UUID] = None
    if run_id:
        try:
            parsed_run_id = uuid.UUID(str(run_id))
        except ValueError:
            parsed_run_id = None

    token = _usage_context.set(
        {
            "run_id": parsed_run_id,
            "user_id": user_id,
            "kind": kind,
        }
    )
    try:
        yield
    finally:
        _usage_context.reset(token)


def get_usage_context() -> Optional[Dict[str, Any]]:
    return _usage_context.get()


def extract_token_counts(raw_msg: Any) -> Tuple[int, int]:
    """Extract (input_tokens, output_tokens) from LangChain AIMessage.usage_metadata.

    Thinking/reasoning tokens are billed as output. If output_tokens does not already
    include output_token_details['reasoning'], add reasoning tokens to output_tokens.
    """
    if raw_msg is None:
        return 0, 0
    um = getattr(raw_msg, "usage_metadata", None)
    if not isinstance(um, dict):
        return 0, 0

    in_tok = int(um.get("input_tokens") or 0)
    out_tok = int(um.get("output_tokens") or 0)
    total_tok = int(um.get("total_tokens") or 0)
    details = um.get("output_token_details")
    reasoning_tok = int(details.get("reasoning") or 0) if isinstance(details, dict) else 0

    if reasoning_tok and total_tok >= in_tok + out_tok + reasoning_tok:
        out_tok += reasoning_tok

    return max(0, in_tok), max(0, out_tok)


def _write_log_row(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cost_micro_usd: int,
) -> None:
    ctx = _usage_context.get()
    if not ctx:
        logger.warning(f"LLM/search call without run context: model={model}")
    try:
        with SessionLocal() as db:
            row = LLMCallLog(
                run_id=ctx.get("run_id") if ctx else None,
                user_id=str(ctx["user_id"]) if ctx else None,
                kind=str(ctx["kind"]) if ctx else None,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_micro_usd=cost_micro_usd,
            )
            db.add(row)
            db.commit()
    except Exception as exc:
        logger.warning(f"Failed to write llm_call_log row for model={model}: {exc}")


def log_llm_call(model_id: str, raw_msg: Any) -> None:
    """Log one real LLM call with provider-reported tokens and micro-USD cost."""
    in_tok, out_tok = extract_token_counts(raw_msg)
    cost = compute_llm_cost_micro_usd(model_id, in_tok, out_tok)
    _write_log_row(
        model=model_id,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cost_micro_usd=cost,
    )


def log_search_call(provider: str = "tavily", depth: str = "basic") -> None:
    """Log one real search API attempt (including retries) with micro-USD cost."""
    cost = compute_search_cost_micro_usd()
    _write_log_row(
        model=f"{provider}:{depth}",
        input_tokens=0,
        output_tokens=0,
        cost_micro_usd=cost,
    )


def aggregate_run_usage(db: Session, run_id: Optional[str]) -> Dict[str, int]:
    """Aggregate llm_calls, search_calls, tokens_in, tokens_out, and cost_micro_usd from llm_call_log."""
    zero = {
        "llm_calls": 0,
        "search_calls": 0,
        "tokens_in": 0,
        "tokens_out": 0,
        "cost_micro_usd": 0,
    }
    if not run_id:
        return zero
    try:
        parsed_id = uuid.UUID(str(run_id))
    except ValueError:
        return zero

    is_search = LLMCallLog.model.like("tavily%") | LLMCallLog.model.like("exa%")
    stmt = select(
        func.coalesce(func.sum(case((is_search, 0), else_=1)), 0).label("llm_calls"),
        func.coalesce(func.sum(case((is_search, 1), else_=0)), 0).label("search_calls"),
        func.coalesce(func.sum(LLMCallLog.input_tokens), 0).label("tokens_in"),
        func.coalesce(func.sum(LLMCallLog.output_tokens), 0).label("tokens_out"),
        func.coalesce(func.sum(LLMCallLog.cost_micro_usd), 0).label("cost_micro_usd"),
    ).where(LLMCallLog.run_id == parsed_id)

    row = db.execute(stmt).first()
    if not row:
        return zero
    return {
        "llm_calls": int(row.llm_calls or 0),
        "search_calls": int(row.search_calls or 0),
        "tokens_in": int(row.tokens_in or 0),
        "tokens_out": int(row.tokens_out or 0),
        "cost_micro_usd": int(row.cost_micro_usd or 0),
    }
