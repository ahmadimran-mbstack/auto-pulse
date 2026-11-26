export type SupportCategory =
  | "bug"
  | "billing"
  | "linkedin_account"
  | "posts"
  | "feature_request"
  | "other";

export type SupportPriority = "low" | "medium" | "high" | "urgent";

export type SupportStatus = "open" | "in_progress" | "resolved";

export interface SupportTicketSummary {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  status: SupportStatus;
  created_at: string | null;
  updated_at: string | null;
  resolved_at: string | null;
  last_message_at: string | null;
  message_count?: number;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_type: "user" | "admin";
  author_id: string;
  body: string;
  has_attachment: boolean;
  attachment_url: string | null;
  created_at: string | null;
  is_internal?: boolean;
}

export interface SupportEmailLog {
  id: string;
  to_email: string;
  type: string;
  status: "sent" | "failed" | "skipped" | string;
  error: string | null;
  created_at: string | null;
}

export interface UserSupportTicketsResponse {
  items: SupportTicketSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UserSupportTicketDetailResponse {
  ticket: SupportTicketSummary;
  messages: SupportTicketMessage[];
}

export interface AdminSupportTicketsResponse {
  items: SupportTicketSummary[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    open: number;
    in_progress: number;
    resolved: number;
  };
}

export interface AdminSupportTicketDetailResponse {
  ticket: SupportTicketSummary;
  messages: SupportTicketMessage[];
  email_logs: SupportEmailLog[];
}

export interface AdminBadgeCountsResponse {
  pending_payments: number;
  open_tickets: number;
}
