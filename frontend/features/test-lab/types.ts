export type TestLabStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped_dry_run"
  | "skipped_not_approved";

export type TestLabRunStatus =
  | "scheduled"
  | "running"
  | "completed"
  | "cancelled"
  | "failed";

export interface TestLabEvent {
  ts: string;
  step: string;
  status: string;
  message: string;
  delay_seconds?: number | null;
}

export interface TestLabPostPreview {
  id: string;
  status: string;
  topic_title: string;
  caption: string;
  hashtags: string[];
  first_comment?: string | null;
  approval_decision?: string | null;
  external_url?: string | null;
}

export interface TestLabStepErrorDetail {
  code: string;
  node?: string | null;
  message: string;
  stack?: string | null;
}

export interface TestLabRun {
  id: string;
  user_id: string;
  status: TestLabRunStatus;
  topic_hint?: string | null;
  dry_run: boolean;
  generate_at: string;
  approve_at: string;
  upload_at: string;
  generate_status: TestLabStepStatus;
  approve_status: TestLabStepStatus;
  upload_status: TestLabStepStatus;
  generate_started_at?: string | null;
  generate_finished_at?: string | null;
  approve_started_at?: string | null;
  approve_finished_at?: string | null;
  upload_started_at?: string | null;
  upload_finished_at?: string | null;
  generate_error?: string | null;
  approve_error?: string | null;
  upload_error?: string | null;
  error_details?: Record<string, TestLabStepErrorDetail>;
  post_id?: string | null;
  post_preview?: TestLabPostPreview | null;
  events: TestLabEvent[];
  created_at: string;
  updated_at: string;
}

export interface TestLabStatus {
  enabled: boolean;
  timezone: string;
  slack_connected: boolean;
  slack_workspace?: string | null;
  linkedin_connected: boolean;
  linkedin_valid: boolean;
  linkedin_account_name?: string | null;
  run?: TestLabRun | null;
}

export interface TestLabCreatePayload {
  topic_hint?: string;
  dry_run: boolean;
  generate_at: string;
  approve_at: string;
  upload_at: string;
}
