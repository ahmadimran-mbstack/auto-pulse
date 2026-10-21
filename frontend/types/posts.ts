// Type definitions for AutoPulse daily post drafts, schedules, and statuses

export type PostStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed";

export interface PostSource {
  title: string;
  url: string;
  published_at: string | null;
}

export interface PostListItem {
  id: string;
  status: PostStatus;
  run_date: string;
  topic_title: string;
  caption_preview: string;
  created_at: string;
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
}

export interface PostSchedule {
  next_draft_at: string | null;
  next_post_at: string | null;
}
