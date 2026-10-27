// Type definitions for AutoPulse daily post drafts, schedules, and statuses

export type PostStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed"
  | "expired";

export interface PostSource {
  title: string;
  url: string;
  published_at: string | null;
}

export interface PostApprovalItem {
  state: "pending" | "approved" | "rejected" | "expired";
  expires_at?: string | null;
  decided_at?: string | null;
  channel?: "email" | "slack" | null;
  decision?: "approved" | "rejected" | null;
}

export interface PostListItem {
  id: string;
  status: PostStatus;
  run_date: string;
  topic_title: string;
  caption_preview: string;
  created_at: string;
  approval?: PostApprovalItem | null;
}

export interface PaginatedPosts {
  items: PostListItem[];
  next_cursor: string | null;
}

export interface GetPostsParams {
  limit?: number;
  cursor?: string | null;
  status?: string | null;
}

export interface PostPublicationItem {
  platform: string;
  status: "pending" | "publishing" | "published" | "failed";
  external_url: string | null;
  error_code: string | null;
  published_at: string | null;
}

export interface PostDetail {
  id: string;
  status: PostStatus;
  run_date: string;
  topic_title: string;
  topic_url: string;
  sources: PostSource[];
  caption: string;
  hashtags: string[];
  created_at: string;
  publish_at?: string | null;
  approval?: PostApprovalItem | null;
  publications?: PostPublicationItem[];
}

export interface PostSchedule {
  next_draft_at: string | null;
  next_post_at: string | null;
}

export type PublicApprovalState = "pending" | "approved" | "rejected" | "expired";

export interface PublicApprovalData {
  state: PublicApprovalState;
  caption: string;
  hashtags: string[];
  topic_title: string;
  topic_url: string;
  display_name: string;
  timezone: string;
  publish_at: string | null;
  expires_at: string | null;
}
