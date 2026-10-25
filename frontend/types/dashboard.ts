// Type definitions for AutoPulse dashboard overview contract
import type { Tone } from "./profile";
import type { PostListItem, PostStatus } from "./posts";

export interface DashboardProfile {
  display_name: string | null;
  niche_description: string | null;
  tone: Tone | null;
  brand_name: string | null;
  brand_primary_hex: string | null;
  brand_accent_hex: string | null;
  timezone: string | null;
  post_time: string | null;
  post_days: number[];
  onboarding_complete: boolean;
}

export interface DashboardConnection {
  provider: string;
  status: "connected" | "expired" | "not_connected" | string;
  account_name: string | null;
  expires_at: string | null;
  days_left: number | null;
  connected_at?: string | null;
}

export interface DashboardTodayPost {
  id: string;
  status: PostStatus;
  topic_title: string;
  run_date: string;
  publish_at: string | null;
}

export interface DashboardSchedule {
  next_draft_at: string | null;
  next_post_at: string | null;
}

export interface DashboardStats {
  awaiting_approval: number;
  published_30d: number;
  failed_30d: number;
}

export interface DashboardData {
  profile: DashboardProfile;
  connections: DashboardConnection[];
  today: DashboardTodayPost | null;
  recent_posts: PostListItem[];
  schedule: DashboardSchedule;
  stats: DashboardStats;
}
