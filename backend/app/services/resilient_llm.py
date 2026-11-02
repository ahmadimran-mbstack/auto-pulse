import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Type, Union
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.runnables import Runnable, RunnableLambda
from pydantic import BaseModel

logger = logging.getLogger(__name__)


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
    """Wraps an underlying LangChain BaseChatModel to enforce single retry on failure
    and eliminate silent fallback generation. If the model fails twice, it raises an explicit error.
    """

    def __init__(self, real_model: Optional[BaseChatModel] = None, model_name: str = "default"):
        self.real_model = real_model
        self.model_name = model_name

    def with_structured_output(self, schema: Any, include_raw: bool = False, **kwargs: Any) -> Runnable:
        real_model = self.real_model

        def _invoke_structured(input_val: Any) -> Any:
            if real_model is None:
                raise RuntimeError(f"LLM model '{self.model_name}' is not configured or available")

            last_exc = None
            for attempt in range(1, 3):
                try:
                    structured = real_model.with_structured_output(schema, include_raw=include_raw, **kwargs)
                    result = structured.invoke(input_val)
                    if include_raw:
                        if isinstance(result, dict) and result.get("parsed") is not None:
                            return result
                    elif result is not None:
                        return result
                except Exception as exc:
                    last_exc = exc
                    logger.warning(f"LLM call to {self.model_name} failed on attempt {attempt}: {exc}")

            raise RuntimeError(f"LLM call to {self.model_name} for schema {getattr(schema, '__name__', str(schema))} failed after 2 attempts: {last_exc}")

        return RunnableLambda(_invoke_structured)

    def invoke(self, input_val: Any, **kwargs: Any) -> Any:
        if self.real_model is not None:
            last_exc = None
            for attempt in range(1, 3):
                try:
                    return self.real_model.invoke(input_val, **kwargs)
                except Exception as exc:
                    last_exc = exc
                    logger.warning(f"LLM invoke to {self.model_name} failed on attempt {attempt}: {exc}")
            raise RuntimeError(f"Direct LLM invoke to {self.model_name} failed: {last_exc}")
        raise RuntimeError(f"LLM model '{self.model_name}' is not configured")
