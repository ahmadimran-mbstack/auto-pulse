"""Admin user management routes under /api/admin/*."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.routes.admin_deps import AdminCaller, rate_limit_admin_mutation, require_admin_caller
from app.db.session import get_db
from app.services import admin_users as admin_users_svc

router = APIRouter(prefix="/api/admin", tags=["admin-users"])


class UpdateUserStatusRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str
    expected_status: str
    reason: str = Field(..., min_length=2, max_length=500)
    send_email: bool = True
    admin_message: Optional[str] = Field(default=None, max_length=1000)


class DeleteUserRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    confirm_email: str
    reason: str = Field(..., min_length=2, max_length=500)
    send_email: bool = True
    admin_message: Optional[str] = Field(default=None, max_length=1000)


class DeleteDeletedAccountRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: str


@router.get("/users")
def get_users(
    search: Optional[str] = Query(None),
    plan: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    payment_state: Optional[str] = Query(None),
    sort: str = Query("created_at"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.list_admin_users(
        db=db,
        search=search,
        plan=plan,
        account_status=status_filter,
        payment_state=payment_state,
        sort_by=sort,
        sort_dir=order,
        page=page,
        page_size=page_size,
    )


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.get_admin_user_detail(db=db, user_id=user_id)


@router.patch("/users/{user_id}/status")
def patch_user_status(
    user_id: str,
    payload: UpdateUserStatusRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.change_user_status(
        db=db,
        target_user_id=user_id,
        actor_id=admin.id,
        actor_email=admin.email,
        new_status=payload.status.strip().lower(),
        expected_status=payload.expected_status.strip().lower(),
        reason=payload.reason,
        send_email=payload.send_email,
        admin_message=payload.admin_message,
    )


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    payload: DeleteUserRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.admin_delete_user(
        db=db,
        target_user_id=user_id,
        actor_id=admin.id,
        actor_email=admin.email,
        confirm_email=payload.confirm_email,
        reason=payload.reason,
        send_email=payload.send_email,
        admin_message=payload.admin_message,
    )


@router.get("/deleted-accounts")
def get_deleted_accounts(
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    admin: AdminCaller = Depends(require_admin_caller),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.list_deleted_accounts(
        db=db,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.delete("/deleted-accounts")
def delete_deleted_account(
    payload: DeleteDeletedAccountRequest,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.remove_deleted_account(
        db=db,
        email=payload.email,
        actor_id=admin.id,
        actor_email=admin.email,
    )


@router.post("/users/{user_id}/notifications/{log_id}/resend")
def resend_notification(
    user_id: str,
    log_id: str,
    admin: AdminCaller = Depends(rate_limit_admin_mutation),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    return admin_users_svc.resend_user_email_log(
        db=db,
        user_id=user_id,
        log_id=log_id,
        actor_id=admin.id,
        actor_email=admin.email,
    )
