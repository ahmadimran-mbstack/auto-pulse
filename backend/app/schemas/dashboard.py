import uuid
from typing import List, Optional
from pydantic import BaseModel
from app.schemas.connection import ConnectionSummaryResponse


class DashboardProfile(BaseModel):
    display_name: Optional[str] = None
    niche_description: Optional[str] = None
    tone: Optional[str] = None
    brand_name: Optional[str] = None
    brand_primary_hex: Optional[str] = None
    brand_accent_hex: Optional[str] = None
    timezone: Optional[str] = None
    post_time: Optional[str] = None
    post_days: List[int] = []
    onboarding_complete: bool = False


class DashboardTodayPost(BaseModel):
    id: uuid.UUID
    status: str
    topic_title: str
    run_date: str
    publish_at: Optional[str] = None


class DashboardRecentPost(BaseModel):
    id: uuid.UUID
    status: str
    run_date: str
    topic_title: str
    caption_preview: str
    created_at: str


class DashboardSchedule(BaseModel):
    next_draft_at: Optional[str] = None
    next_post_at: Optional[str] = None


class DashboardStats(BaseModel):
    awaiting_approval: int
    published_30d: int
    failed_30d: int


class DashboardResponse(BaseModel):
    profile: Optional[DashboardProfile] = None
    connections: List[ConnectionSummaryResponse] = []
    today: Optional[DashboardTodayPost] = None
    recent_posts: List[DashboardRecentPost] = []
    schedule: DashboardSchedule
    stats: DashboardStats
