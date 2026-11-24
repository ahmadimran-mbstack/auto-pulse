"""FastAPI router for the temporary development-only Test Lab."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.auth import User, current_user
from app.core.config import settings
from app.core.limiter import rate_limit
from app.db.session import get_db
from app.test_lab import service
from app.test_lab.schemas import TestLabCreateRequest, TestLabRunResponse, TestLabStatusResponse

router = APIRouter(prefix="/test-lab", tags=["test-lab"])


def _resolve_user_email(db: Session, user: User) -> str:
    if user.email:
        return user.email.strip().lower()
    row = db.execute(
        text("SELECT email FROM neon_auth.user WHERE id::text = :uid LIMIT 1"),
        {"uid": user.id},
    ).scalar()
    return str(row).strip().lower() if row else ""


def require_test_lab_access(
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> User:
    if not settings.ENABLE_TEST_LAB:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Test Lab is not enabled."},
        )

    raw_allowlist = (settings.TEST_LAB_ALLOWED_EMAILS or "").strip()
    if raw_allowlist:
        allowed = {e.strip().lower() for e in raw_allowlist.split(",") if e.strip()}
        caller_email = _resolve_user_email(db, user)
        if not caller_email or caller_email not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "forbidden",
                    "message": "Your account is not in TEST_LAB_ALLOWED_EMAILS.",
                },
            )
    return user


def _parse_uuid(raw: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Test run not found."},
        ) from exc


@router.get("/status", response_model=TestLabStatusResponse)
def get_test_lab_status(
    user: User = Depends(require_test_lab_access),
    db: Session = Depends(get_db),
) -> TestLabStatusResponse:
    return service.get_status(db, user.id)


@router.post("/runs", response_model=TestLabRunResponse, status_code=status.HTTP_201_CREATED)
def create_test_lab_run(
    payload: TestLabCreateRequest,
    user: User = Depends(require_test_lab_access),
    db: Session = Depends(get_db),
) -> TestLabRunResponse:
    return service.create_run(db, user.id, payload)


@router.post("/runs/{run_id}/cancel", response_model=TestLabRunResponse)
def cancel_test_lab_run(
    run_id: str,
    user: User = Depends(require_test_lab_access),
    db: Session = Depends(get_db),
) -> TestLabRunResponse:
    return service.cancel_run(db, user.id, _parse_uuid(run_id))


@router.post("/runs/{run_id}/retry-generate", response_model=TestLabRunResponse, dependencies=[Depends(rate_limit("generate"))])
def retry_test_lab_generate(
    run_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_test_lab_access),
    db: Session = Depends(get_db),
) -> TestLabRunResponse:
    parsed_id = _parse_uuid(run_id)
    res = service.prepare_retry_generate(db, user.id, parsed_id)
    background_tasks.add_task(service.run_retry_generate_task, parsed_id)
    return res


@router.delete("/runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def reset_test_lab_run(
    run_id: str,
    user: User = Depends(require_test_lab_access),
    db: Session = Depends(get_db),
) -> Response:
    service.reset_latest_run(db, user.id, _parse_uuid(run_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
