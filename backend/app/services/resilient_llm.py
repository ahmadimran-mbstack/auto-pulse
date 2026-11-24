import concurrent.futures
import contextvars
import logging
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Type, Union
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import Runnable, RunnableLambda
from pydantic import BaseModel
from app.core.config import settings
from app.services.usage_logger import log_llm_call

logger = logging.getLogger(__name__)


def run_call_with_timeout(func, args=(), kwargs=None, timeout_seconds: float = 45.0) -> Any:
    """Executes a blocking function with a hard wall-clock timeout without blocking on hung threads."""
    kwargs = kwargs or {}
    ctx = contextvars.copy_context()
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = executor.submit(ctx.run, func, *args, **kwargs)
    try:
        return future.result(timeout=timeout_seconds)
    except concurrent.futures.TimeoutError as exc:
        executor.shutdown(wait=False, cancel_futures=True)
        raise TimeoutError(f"Operation timed out after {timeout_seconds}s") from exc
    finally:
        executor.shutdown(wait=False)


def _extract_text_from_input(input_val: Any) -> str:
    """Extract plain string content from diverse LangChain input types."""
    if isinstance(input_val, str):
        return input_val
    if hasattr(input_val, "to_string"):
        return input_val.to_string()
    if isinstance(input_val, list):
        parts = []
        for item in input_val:
            if hasattr(item, "content"):
                parts.append(str(item.content))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    if isinstance(input_val, dict):
        return "\n".join(f"{k}: {v}" for k, v in input_val.items())
    return str(input_val)


def _is_transient_error(exc: Exception) -> bool:
    """Return True if the exception is a transient network, rate-limit, 5xx, or DB error."""
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    name = type(exc).__name__.lower()
    if any(tok in name for tok in ("timeout", "connection", "operationalerror", "dbapierror", "servererror", "ratelimit")):
        return True
    msg = str(exc).lower()
    transient_markers = (
        "429", "500", "502", "503", "504",
        "unavailable", "resource_exhausted", "rate limit", "too many requests",
        "timed out", "timeout", "connection reset", "connection refused",
        "temporarily unavailable", "high demand", "bad gateway", "service unavailable",
    )
    return any(m in msg for m in transient_markers)


def _should_fallback_model(exc: Exception, model_name: str) -> bool:
    """Return True when a non-primary model fails due to unavailability, 404, or timeout."""
    if not model_name or model_name == settings.LLM_MODEL:
        return False
    msg = str(exc).lower()
    return _is_transient_error(exc) or "404" in msg or "not_found" in msg or "not found" in msg


class ResilientChatModelWrapper(Runnable):
    """Wraps an underlying LangChain BaseChatModel to enforce hard call timeout,
    up to 2 retries on transient errors, at most 1 retry on bad/empty output,
    and automatic fallback to settings.LLM_MODEL if an auxiliary model is unavailable.
    """

    def __init__(
        self,
        real_model: Optional[BaseChatModel] = None,
        model_name: str = "default",
        timeout_seconds: Optional[float] = None,
        fallback_model: Optional[BaseChatModel] = None,
    ):
        self.real_model = real_model
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds or float(getattr(settings, "LLM_TIMEOUT_SECONDS", 30))
        self._fallback_model = fallback_model

    def _get_fallback_real_model(self) -> Optional[BaseChatModel]:
        if self._fallback_model is not None:
            return self._fallback_model
        if self.model_name == settings.LLM_MODEL:
            return None
        try:
            from app.services.pipeline import create_chat_model
            wrapper = create_chat_model(settings.LLM_MODEL)
            self._fallback_model = getattr(wrapper, "real_model", None)
            return self._fallback_model
        except Exception:
            return None

    def with_structured_output(self, schema: Any, include_raw: bool = False, **kwargs: Any) -> Runnable:
        real_model = self.real_model
        timeout_sec = self.timeout_seconds
        model_name = self.model_name

        def _invoke_structured(input_val: Any) -> Any:
            if real_model is None:
                raise RuntimeError(f"LLM model '{model_name}' is not configured or available")

            active_model = real_model
            active_name = model_name
            last_exc: Optional[Exception] = None
            transient_retries = 0
            bad_output_retries = 0

            while True:
                from app.services.quota import RunBudgetExceeded, check_run_budgets_before_call
                check_run_budgets_before_call(is_llm=True)
                try:
                    structured = active_model.with_structured_output(schema, include_raw=True, **kwargs)
                    result = run_call_with_timeout(structured.invoke, args=(input_val,), timeout_seconds=timeout_sec)
                    if isinstance(result, dict):
                        log_llm_call(active_name, result.get("raw"))
                        if result.get("parsed") is not None:
                            return result if include_raw else result["parsed"]
                        last_exc = ValueError(result.get("parsing_error") or "Empty or invalid structured output")
                    elif result is not None:
                        log_llm_call(active_name, result)
                        return result
                    else:
                        last_exc = ValueError("Model returned None")

                    # Bad/empty output: retry at most once
                    if bad_output_retries < 1:
                        bad_output_retries += 1
                        logger.warning(f"LLM {active_name} returned bad/empty structured output; retrying once")
                        continue
                    break
                except RunBudgetExceeded:
                    raise
                except Exception as exc:
                    last_exc = exc
                    if _is_transient_error(exc):
                        if transient_retries < 2:
                            transient_retries += 1
                            backoff = 0.5 * transient_retries
                            logger.warning(
                                f"Transient LLM error on {active_name} (retry {transient_retries}/2): {exc}"
                            )
                            time.sleep(backoff)
                            continue
                        # Exhausted transient retries: try fallback primary model once if different
                        fb = self._get_fallback_real_model()
                        if fb is not None and active_model is not fb and _should_fallback_model(exc, active_name):
                            logger.warning(f"Falling back from {active_name} to {settings.LLM_MODEL} after error: {exc}")
                            active_model = fb
                            active_name = settings.LLM_MODEL
                            transient_retries = 0
                            continue
                        break
                    else:
                        # Non-transient / bad output error: retry at most once
                        fb = self._get_fallback_real_model()
                        if fb is not None and active_model is not fb and _should_fallback_model(exc, active_name):
                            logger.warning(f"Falling back from {active_name} to {settings.LLM_MODEL}: {exc}")
                            active_model = fb
                            active_name = settings.LLM_MODEL
                            continue
                        if bad_output_retries < 1:
                            bad_output_retries += 1
                            logger.warning(f"LLM {active_name} output error; retrying once: {exc}")
                            continue
                        break

            raise RuntimeError(
                f"LLM call to {active_name} for schema {getattr(schema, '__name__', str(schema))} "
                f"failed: {last_exc}"
            )

        return RunnableLambda(_invoke_structured)

    def invoke(self, input_val: Any, **kwargs: Any) -> Any:
        if self.real_model is None:
            raise RuntimeError(f"LLM model '{self.model_name}' is not configured")

        active_model = self.real_model
        active_name = self.model_name
        last_exc: Optional[Exception] = None
        transient_retries = 0
        bad_output_retries = 0

        while True:
            from app.services.quota import RunBudgetExceeded, check_run_budgets_before_call
            check_run_budgets_before_call(is_llm=True)
            try:
                res = run_call_with_timeout(
                    active_model.invoke,
                    args=(input_val,),
                    kwargs=kwargs,
                    timeout_seconds=self.timeout_seconds,
                )
                log_llm_call(active_name, res)
                content = getattr(res, "content", res)
                if content is None or (isinstance(content, str) and not content.strip()):
                    last_exc = ValueError("Model returned empty text")
                    if bad_output_retries < 1:
                        bad_output_retries += 1
                        continue
                    break
                return res
            except RunBudgetExceeded:
                raise
            except Exception as exc:
                last_exc = exc
                if _is_transient_error(exc):
                    if transient_retries < 2:
                        transient_retries += 1
                        time.sleep(0.5 * transient_retries)
                        continue
                    fb = self._get_fallback_real_model()
                    if fb is not None and active_model is not fb and _should_fallback_model(exc, active_name):
                        logger.warning(f"Falling back from {active_name} to {settings.LLM_MODEL} after error: {exc}")
                        active_model = fb
                        active_name = settings.LLM_MODEL
                        transient_retries = 0
                        continue
                    break
                else:
                    fb = self._get_fallback_real_model()
                    if fb is not None and active_model is not fb and _should_fallback_model(exc, active_name):
                        active_model = fb
                        active_name = settings.LLM_MODEL
                        continue
                    if bad_output_retries < 1:
                        bad_output_retries += 1
                        continue
                    break

        raise RuntimeError(f"Direct LLM invoke to {active_name} failed: {last_exc}")
