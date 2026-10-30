export type AnalyticsRange = "7d" | "30d" | "90d";

export interface AnalyticsSummary {
  range: AnalyticsRange;
  timezone: string;
  start_date: string;
  end_date: string;
  all_time_posts: number;
  total_generated: number;
  sent_for_approval: number;
  approved: number;
  rejected: number;
  expired: number;
  awaiting_approval: number;
  published: number;
  failed: number;
  outcome_unknown: number;
  decided_count: number;
  approval_rate: number | null;
  avg_ai_score: number | null;
  scored_posts_count: number;
  metrics_available: boolean;
}

export interface DailyPostBucket {
  date: string;
  generated: number;
  approved: number;
  published: number;
  failed: number;
  outcome_unknown: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  count: number;
  pct_of_generated: number;
}

export interface AnalyticsFunnel {
  stages: FunnelStage[];
  rejected: number;
  expired: number;
  failed: number;
  outcome_unknown: number;
}

export interface HookStyleMetric {
  hook_style: string;
  label: string;
  post_count: number;
  approved_count: number;
  published_count: number;
  failed_count: number;
  outcome_unknown_count: number;
  approval_rate: number;
  share_pct: number;
  avg_ai_score: number | null;
  low_sample: boolean;
}

export interface TopicMetric {
  topic: string;
  post_count: number;
  approved_count: number;
  published_count: number;
  outcome_unknown_count: number;
  approval_rate: number;
  share_pct: number;
  avg_ai_score: number | null;
  low_sample: boolean;
}

export interface ApprovalTurnaroundMetric {
  source: string;
  label: string;
  decisions_count: number;
  avg_minutes: number | null;
  median_minutes: number | null;
  min_minutes: number | null;
  max_minutes: number | null;
  low_sample: boolean;
}

export interface AnalyticsRecentPost {
  id: string;
  topic_title: string;
  hook_style: string;
  hook_label: string;
  status: string;
  ai_score: number | null;
  approval_source: string | null;
  local_date: string;
  created_at: string;
  published_at: string | null;
  linkedin_url: string | null;
}

export interface AnalyticsDashboardData {
  summary: AnalyticsSummary;
  posts_over_time: DailyPostBucket[];
  funnel: AnalyticsFunnel;
  hook_styles: HookStyleMetric[];
  topics: TopicMetric[];
  approval_turnaround: ApprovalTurnaroundMetric[];
  recent_posts: AnalyticsRecentPost[];
}

