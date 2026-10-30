// Type definitions for AutoPulse daily post drafts, schedules, and statuses

export type PostStatus =
  | "draft"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "publishing"
  | "published"
  | "failed"
  | "outcome_unknown"
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
  topic?: string;
  post_format?: string;
  ai_score?: number | null;
  needs_review?: boolean;
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
  topic?: string;
  post_format?: string;
  ai_score?: number | null;
  needs_review?: boolean;
  topic_url: string;
  sources: PostSource[];
  caption: string;
  hashtags: string[];
  created_at: string;
  publish_at?: string | null;
  approval?: PostApprovalItem | null;
  publications?: PostPublicationItem[];
}

// ---------------------------------------------------------------------------
// Writing Agents & Audit Trace Types
// ---------------------------------------------------------------------------

export interface FindingTrace {
  start: number;
  end: number;
  quote: string;
  pattern: string;
  why: string;
  fix_hint?: string | null;
}

export interface SubScoresTrace {
  vocabulary: number;
  structure: number;
  rhythm: number;
  specificity: number;
  tone: number;
}

export interface RoundTrace {
  round: number;
  text?: string;
  post_text?: string;
  score?: number;
  final_score?: number;
  subscores?: SubScoresTrace | null;
  sub_scores?: SubScoresTrace | null;
  findings: FindingTrace[];
  check_failures?: string[];
}

export interface FinderTrace {
  topic: string;
  angle: string;
  post_format: string;
  hook_type: string;
  why_now: string;
  sources: Array<{ title: string; url: string }>;
  avoided?: string[];
}

export interface GTMTrace {
  chosen_hook: string;
  hook_options: string[];
  structure?: string[];
  structure_lines?: string[];
  cta?: string | null;
  ending_strategy?: string | null;
  notes?: string[];
}

export interface GTMReviewTrace {
  hook_strength: number;
  notes?: string[];
  review_notes?: string[];
}

export interface FinalTrace {
  text?: string;
  post_text?: string;
  score?: number;
  final_score?: number;
  passed?: boolean;
  needs_review?: boolean;
  reason?: "passed" | "max_rounds" | "no_improvement" | string;
}

export interface AgentTrace {
  finder?: FinderTrace | null;
  gtm?: GTMTrace | null;
  gtm_brief?: GTMTrace | null;
  gtm_review?: GTMReviewTrace | null;
  rounds: RoundTrace[];
  final?: FinalTrace | null;
  final_score?: number;
  needs_review?: boolean;
  exit_reason?: string;
  best_round?: number;
  final_check_failures?: string[];
}

export type RunStatus = "queued" | "running" | "done" | "failed";
export type RunStep = "finder" | "gtm" | "drafter" | "detector" | "rewrite" | null;

export interface RunResponse {
  id?: string;
  status: RunStatus;
  current_step: RunStep | string;
  round: number;
  max_rounds: number;
  trace?: AgentTrace | null;
  agent_trace?: AgentTrace | null;
  result?: {
    post_text?: string;
    caption?: string;
    text?: string;
    hashtags?: string[];
    image_headline?: string;
    score?: number;
    final_score?: number;
    needs_review?: boolean;
    exit_reason?: string;
    check_failures?: string[];
  } | null;
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
