import contextvars
import time
from typing import Any, Dict
from sqlalchemy import event
from sqlalchemy.engine import Engine

# Per-request metrics context variable storing timing and database query counts
request_metrics: contextvars.ContextVar[Dict[str, Any]] = contextvars.ContextVar(
    "request_metrics",
    default={"auth_ms": 0.0, "db_ms": 0.0, "queries": 0},
)


# Plain helper to record execution of a database query
def record_query(duration_ms: float) -> None:
    try:
        metrics = request_metrics.get()
        metrics["queries"] = metrics.get("queries", 0) + 1
        metrics["db_ms"] = metrics.get("db_ms", 0.0) + duration_ms
    except Exception:
        pass


# Plain helper to record authentication timing
def record_auth(duration_ms: float) -> None:
    try:
        metrics = request_metrics.get()
        metrics["auth_ms"] = metrics.get("auth_ms", 0.0) + duration_ms
    except Exception:
        pass


# Register SQLAlchemy event listeners on the engine to monitor query count and time
def setup_db_timing_listeners(engine: Engine) -> None:
    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if context is not None:
            context._query_start_time = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        if context is not None and hasattr(context, "_query_start_time"):
            duration_ms = (time.perf_counter() - context._query_start_time) * 1000
            record_query(duration_ms)

    @event.listens_for(engine, "handle_error")
    def handle_error(exception_context):
        ctx = exception_context.execution_context
        if ctx is not None and hasattr(ctx, "_query_start_time"):
            duration_ms = (time.perf_counter() - ctx._query_start_time) * 1000
            record_query(duration_ms)
