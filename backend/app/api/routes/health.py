import logging
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.db.session import engine

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


# Simple liveness check that does not require database or authentication
@router.get("/health")
def health_check():
    return {"ok": True}


# Database health check that runs SELECT 1 to verify database connectivity
@router.get("/health/db")
def health_db_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"ok": True}
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error": {
                    "code": "db_unavailable",
                    "message": "Database is unreachable",
                }
            },
        )
