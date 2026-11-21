"""Pydantic schemas for the Test Lab API."""

import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class TestLabCreateRequest(BaseModel):
    topic_hint: Optional[str] = Field(default=None, max_length=500)
    dry_run: bool = False
    generate_at: datetime.datetime
    approve_at: datetime.datetime
    upload_at: datetime.datetime


class TestLabEvent(BaseModel):
    ts: datetime.datetime
    step: str
    status: str
    message: str
    delay_seconds: Optional[int] = None


class TestLabPostPreview(BaseModel):
    id: str
    status: str
    topic_title: str
    caption: str
    hashtags: List[str] = Field(default_factory=list)
    first_comment: Optional[str] = None
    approval_decision: Optional[str] = None
    external_url: Optional[str] = None


class TestLabStepErrorDetail(BaseModel):
    code: str
    node: Optional[str] = None
    message: str
    stack: Optional[str] = None


class TestLabRunResponse(BaseModel):
    id: str
    user_id: str
    status: str
    topic_hint: Optional[str] = None
    dry_run: bool
    generate_at: datetime.datetime
    approve_at: datetime.datetime
    upload_at: datetime.datetime
    generate_status: str
    approve_status: str
    upload_status: str
    generate_started_at: Optional[datetime.datetime] = None
    generate_finished_at: Optional[datetime.datetime] = None
    approve_started_at: Optional[datetime.datetime] = None
    approve_finished_at: Optional[datetime.datetime] = None
    upload_started_at: Optional[datetime.datetime] = None
    upload_finished_at: Optional[datetime.datetime] = None
    generate_error: Optional[str] = None
    approve_error: Optional[str] = None
    upload_error: Optional[str] = None
    error_details: dict[str, TestLabStepErrorDetail] = Field(default_factory=dict)
    post_id: Optional[str] = None
    post_preview: Optional[TestLabPostPreview] = None
    events: List[TestLabEvent] = Field(default_factory=list)
    created_at: datetime.datetime
    updated_at: datetime.datetime


class TestLabStatusResponse(BaseModel):
    enabled: bool = True
    timezone: str
    slack_connected: bool
    slack_workspace: Optional[str] = None
    linkedin_connected: bool
    linkedin_valid: bool
    linkedin_account_name: Optional[str] = None
    run: Optional[TestLabRunResponse] = None
