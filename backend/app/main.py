import logging
import time
import uuid
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import re
from app.api.routes.health import router as health_router
from app.api.routes.me import router as me_router
from app.api.routes.profile import router as profile_router
from app.api.routes.connections import router as connections_router
from app.api.routes.posts import router as posts_router
from app.api.routes.public import router as public_router
from app.core.config import settings

# Configure server logging based on LOG_LEVEL
log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("app.access")

# Disable documentation endpoints in production
is_production = settings.ENV == "production"
app = FastAPI(
    title="AutoPulse Backend",
    version="0.1.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)

# CORS middleware configuration
# Allows origins configured in FRONTEND_URL and local dev URLs
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)


# Helper to sanitize paths so approval tokens are never written to access logs
def sanitize_log_path(path: str) -> str:
    return re.sub(r"(/public/approvals/)[^/]+", r"\1[token]", path)


# Request logging middleware
# Logs one line per request with method, path, status, duration, and X-Request-ID
# Never logs Authorization headers, tokens, or sensitive values
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        start_time = time.perf_counter()

        response = await call_next(request)

        duration_ms = (time.perf_counter() - start_time) * 1000
        safe_path = sanitize_log_path(request.url.path)
        logger.info(
            f"method={request.method} path={safe_path} "
            f"status={response.status_code} duration={duration_ms:.2f}ms request_id={request_id}"
        )

        response.headers["X-Request-ID"] = request_id
        return response


app.add_middleware(RequestLoggingMiddleware)


# Exception handler for expected HTTP exceptions
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        error_dict = dict(exc.detail)
    else:
        code = "not_found" if exc.status_code == 404 else "http_error"
        error_dict = {"code": code, "message": str(exc.detail)}

    return JSONResponse(
        status_code=exc.status_code,
        content={"error": error_dict},
        headers=exc.headers,
    )


# Exception handler for request validation failures
# Returns per-field error messages in our standardized error shape
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    field_errors = {}
    for err in exc.errors():
        loc = err.get("loc", ())
        # Extract the specific field name from error location
        if len(loc) >= 2 and loc[0] == "body":
            field_name = str(loc[1])
        elif loc:
            field_name = str(loc[-1])
        else:
            field_name = "general"

        raw_msg = err.get("msg", "Invalid value.")
        err_type = err.get("type", "")

        # Clean Pydantic error prefixes so errors are plain and human-friendly
        if raw_msg.startswith("Value error, "):
            msg = raw_msg.replace("Value error, ", "", 1)
        elif err_type == "extra_forbidden":
            msg = f"Unexpected field '{field_name}' is not allowed."
        elif err_type == "missing":
            msg = f"{field_name.replace('_', ' ').capitalize()} is required."
        elif "string_too_short" in err_type:
            msg = raw_msg
        elif "string_too_long" in err_type:
            msg = raw_msg
        else:
            msg = raw_msg

        if field_name not in field_errors:
            field_errors[field_name] = msg

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "validation_error",
                "message": "Some fields need fixing.",
                "fields": field_errors,
            }
        },
    )


# Catch-all exception handler for unhandled errors: returns a generic 500 without stack trace
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error processing request: {request.method} {request.url.path}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": {
                "code": "internal_server_error",
                "message": "An unexpected internal server error occurred",
            }
        },
    )


# Register API route modules
app.include_router(health_router)
app.include_router(me_router)
app.include_router(profile_router)
app.include_router(connections_router)
app.include_router(posts_router)
app.include_router(public_router)

