import concurrent.futures
import logging
import re
import time
from typing import Any, Dict, List, Optional, Sequence, Type, Union
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import Runnable, RunnableLambda
from pydantic import BaseModel
from app.core.config import settings

logger = logging.getLogger(__name__)


def run_call_with_timeout(func, args=(), kwargs=None, timeout_seconds: float = 45.0) -> Any:
    """Executes a blocking function with a hard wall-clock timeout using a single-worker executor."""
    kwargs = kwargs or {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(func, *args, **kwargs)
        try:
            return future.result(timeout=timeout_seconds)
        except concurrent.futures.TimeoutError as exc:
            raise TimeoutError(f"Operation timed out after {timeout_seconds}s") from exc


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


class ResilientChatModelWrapper(Runnable):
    """Wraps an underlying LangChain BaseChatModel to enforce single retry on failure,
    hard call timeout (default 45s), capped backoff, and eliminates silent fallback generation.
    If the model fails twice, it raises an explicit error.
    """

    def __init__(
        self,
        real_model: Optional[BaseChatModel] = None,
        model_name: str = "default",
        timeout_seconds: Optional[float] = None,
    ):
        self.real_model = real_model
        self.model_name = model_name
        self.timeout_seconds = timeout_seconds or float(getattr(settings, "LLM_TIMEOUT_SECONDS", 45))

    def with_structured_output(self, schema: Any, include_raw: bool = False, **kwargs: Any) -> Runnable:
        real_model = self.real_model
        timeout_sec = self.timeout_seconds

        def _invoke_structured(input_val: Any) -> Any:
            if real_model is None:
                raise RuntimeError(f"LLM model '{self.model_name}' is not configured or available")

            last_exc = None
            for attempt in range(1, 3):
                try:
                    structured = real_model.with_structured_output(schema, include_raw=include_raw, **kwargs)
                    result = run_call_with_timeout(structured.invoke, args=(input_val,), timeout_seconds=timeout_sec)
                    if include_raw:
                        if isinstance(result, dict) and result.get("parsed") is not None:
                            return result
                    elif result is not None:
                        return result
                except Exception as exc:
                    last_exc = exc
                    logger.warning(f"LLM call to {self.model_name} failed on attempt {attempt}: {exc}")
                    if attempt < 2:
                        time.sleep(1.0)  # Capped backoff

            raise RuntimeError(
                f"LLM call to {self.model_name} for schema {getattr(schema, '__name__', str(schema))} "
                f"failed after 2 attempts: {last_exc}"
            )

        return RunnableLambda(_invoke_structured)

    def invoke(self, input_val: Any, **kwargs: Any) -> Any:
        if self.real_model is not None:
            last_exc = None
            for attempt in range(1, 3):
                try:
                    return run_call_with_timeout(
                        self.real_model.invoke,
                        args=(input_val,),
                        kwargs=kwargs,
                        timeout_seconds=self.timeout_seconds,
                    )
                except Exception as exc:
                    last_exc = exc
                    logger.warning(f"LLM invoke to {self.model_name} failed on attempt {attempt}: {exc}")
                    if attempt < 2:
                        time.sleep(1.0)  # Capped backoff
            raise RuntimeError(f"Direct LLM invoke to {self.model_name} failed after 2 attempts: {last_exc}")
        raise RuntimeError(f"LLM model '{self.model_name}' is not configured")
