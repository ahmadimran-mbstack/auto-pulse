from typing import List, Literal, Optional
import uuid
from pydantic import BaseModel

AnalyticsRange = Literal["7d", "30d", "90d"]


class AnalyticsSummary(BaseModel):
    range: AnalyticsRange
    timezone: str
    start_date: str
    end_date: str
    all_time_posts: int
    total_generated: int
    sent_for_approval: int
    approved: int
    rejected: int
    expired: int
    awaiting_approval: int
    published: int
    failed: int
    outcome_unknown: int
    decided_count: int
    approval_rate: Optional[float] = None
    avg_ai_score: Optional[float] = None
    scored_posts_count: int
    metrics_available: bool = False


class DailyPostBucket(BaseModel):
    date: str
    generated: int
    approved: int
    published: int
    failed: int
    outcome_unknown: int


class FunnelStage(BaseModel):
    stage: str
    label: str
    count: int
    pct_of_generated: float


class AnalyticsFunnel(BaseModel):
    stages: List[FunnelStage]
    rejected: int
    expired: int
    failed: int
    outcome_unknown: int


class HookStyleMetric(BaseModel):
    hook_style: str
    label: str
    post_count: int
    approved_count: int
    published_count: int
    failed_count: int
    outcome_unknown_count: int
    approval_rate: float
    share_pct: float
    avg_ai_score: Optional[float] = None
    low_sample: bool


class TopicMetric(BaseModel):
    topic: str
    post_count: int
    approved_count: int
    published_count: int
    outcome_unknown_count: int
    approval_rate: float
    share_pct: float
    avg_ai_score: Optional[float] = None
    low_sample: bool


class ApprovalTurnaroundMetric(BaseModel):
    source: str
    label: str
    decisions_count: int
    avg_minutes: Optional[float] = None
    median_minutes: Optional[float] = None
    min_minutes: Optional[float] = None
    max_minutes: Optional[float] = None
    low_sample: bool


class AnalyticsRecentPost(BaseModel):
    id: uuid.UUID
    topic_title: str
    hook_style: str
    hook_label: str
    status: str
    ai_score: Optional[int] = None
    approval_source: Optional[str] = None
    local_date: str
    created_at: str
    published_at: Optional[str] = None
    linkedin_url: Optional[str] = None


class AnalyticsDashboardResponse(BaseModel):
    summary: AnalyticsSummary
    posts_over_time: List[DailyPostBucket]
    funnel: AnalyticsFunnel
    hook_styles: List[HookStyleMetric]
    topics: List[TopicMetric]
    approval_turnaround: List[ApprovalTurnaroundMetric]
    recent_posts: List[AnalyticsRecentPost]

