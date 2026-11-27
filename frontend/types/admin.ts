export type AccountStatus = "active" | "suspended" | "disabled";
export type PaymentState = "paid" | "trial" | "expired" | "canceled";

export interface AdminUserListItem {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  is_admin: boolean;
  plan_id: string;
  plan_name: string;
  payment_state: PaymentState;
  account_status: AccountStatus;
  monthly_usage_used: number;
  monthly_usage_limit: number | null;
  monthly_usage_percent: number;
  linkedin_connected: boolean;
  linkedin_expires_at: string | null;
  created_at: string | null;
}

export interface AdminUsersResponse {
  items: AdminUserListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminUserDetailResponse {
  summary: {
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    is_admin: boolean;
    account_status: AccountStatus;
    status_reason: string | null;
    status_changed_at: string | null;
    status_changed_by: string | null;
    created_at: string | null;
    onboarding_complete: boolean;
    timezone: string | null;
  };
  billing: {
    plan_id: string;
    plan_name: string;
    subscription_status: string;
    billing_interval: string | null;
    trial_ends_at: string | null;
    current_period_start: string | null;
    current_period_end: string | null;
    pending_plan_id: string | null;
    pending_billing_interval: string | null;
  };
  quota: {
    scheduled_used: number;
    scheduled_limit: number | null;
    usage_percent: number;
    playground_used: number;
    playground_limit: number | null;
    playground_today_used: number;
    playground_daily_limit: number | null;
    docs_tokens_used: number;
    docs_token_limit: number | null;
    window_start: string | null;
    window_end: string | null;
  };
  connections: {
    linkedin: {
      connected: boolean;
      status: string;
      account_name: string | null;
      expires_at: string | null;
      connected_at: string | null;
    };
    slack: {
      connected: boolean;
      status: string;
      team_name: string | null;
      last_error: string | null;
      connected_at: string | null;
    };
  };
  runs: Array<{
    id: string;
    run_date: string | null;
    run_type: string;
    usage_kind: string;
    status: string;
    duration: number | null;
    search_calls: number;
    llm_calls: number;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    error_code: string | null;
    error_detail: string | null;
    started_at: string | null;
    finished_at: string | null;
  }>;
  payments: Array<{
    id: string;
    plan_id: string;
    billing_interval: string;
    amount_usd: number;
    amount_pkr: number;
    method: string;
    transaction_id: string;
    status: string;
    submitted_at: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    reject_reason: string | null;
  }>;
  email_logs: Array<{
    id: string;
    to_email: string;
    type: string;
    status: string;
    error: string | null;
    attempts: number;
    provider?: string | null;
    provider_message_id: string | null;
    provider_response_ms?: number | null;
    total_duration_ms?: number | null;
    next_attempt_at?: string | null;
    sent_at?: string | null;
    created_at: string | null;
  }>;
  audit_logs: Array<{
    id: string;
    actor_email: string;
    action: string;
    reason: string | null;
    before_state: Record<string, unknown> | null;
    after_state: Record<string, unknown> | null;
    email_status: string | null;
    created_at: string | null;
  }>;
}

export interface DeletedAccountItem {
  id: string;
  email: string;
  user_id: string | null;
  deleted_at: string | null;
  deleted_by: string;
  reason: string | null;
}

export interface DeletedAccountsResponse {
  items: DeletedAccountItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminSubscriberItem {
  id: string;
  name: string;
  email: string;
  is_admin: boolean;
  account_status: AccountStatus;
  plan_id: string;
  plan_name: string;
  billing_interval: "monthly" | "annual" | null;
  monthly_rate_usd: number;
  current_period_start: string | null;
  current_period_end: string | null;
  days_left: number | null;
  effective_status: string;
  is_overdue: boolean;
  has_pending_payment: boolean;
  scheduled_used: number;
  scheduled_limit: number | null;
  usage_percent: number;
}

export interface AdminSubscribersResponse {
  summary: {
    paid_subscribers: number;
    estimated_mrr_usd: number;
    expiring_7d: number;
    overdue: number;
  };
  items: AdminSubscriberItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface AdminUsageItem {
  id: string;
  name: string;
  email: string;
  account_status: AccountStatus;
  plan_id: string;
  plan_name: string;
  effective_status: string;
  trial_days_left: number | null;
  posts_generated: number;
  posts_published: number;
  failed_runs: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  quota_used: number;
  quota_limit: number | null;
  quota_percent: number;
  today_spend_usd: number;
  daily_spend_limit_usd: number | null;
  playground_today_used: number;
  playground_daily_limit: number | null;
}

export interface AdminUsageResponse {
  view: "paid" | "trial";
  items: AdminUsageItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  sources_note: Record<string, string>;
}

export interface AdminPlanOverviewItem {
  id: string;
  name: string;
  is_public: boolean;
  is_active?: boolean;
  is_popular?: boolean;
  is_system?: boolean;
  is_purchasable?: boolean;
  sort_order?: number;
  version?: number;
  rate_limit_tier?: string;
  extra_features?: string[];
  monthly_price_cents?: number | null;
  annual_price_cents?: number | null;
  annual_monthly_equivalent_cents?: number | null;
  daily_spend_limit_cents?: number | null;
  monthly_price_usd: number | null;
  monthly_price_pkr_approx: number | null;
  annual_price_usd: number | null;
  annual_price_pkr_approx: number | null;
  annual_monthly_equivalent_usd: number | null;
  plan_length_days: number;
  limits: {
    linkedin_profiles: number | null;
    scheduled_posts_per_period: number | null;
    playground_runs_per_period: number | null;
    playground_runs_per_day: number | null;
    max_post_days_per_week: number | null;
    daily_spend_limit_usd: number | null;
    docs_token_limit: number | null;
  };
  rate_limits: {
    api_per_min: number | null;
    generate_per_hour: number | null;
    payment_submit_per_hour: number | null;
  };
  features: {
    approval_email: boolean;
    approval_slack: boolean;
    analytics_level: string;
    support_label: string;
  };
  subscribers: {
    total: number;
    active: number;
    paid?: number;
  };
  references_count?: number;
  updated_at?: string | null;
  updated_by?: string | null;
}

export interface AdminPlansOverviewResponse {
  currency: string;
  pkr_per_usd: number;
  annual_discount: number;
  trial_days?: number;
  rate_limit_windows: Record<string, number>;
  rate_limit_tiers?: string[];
  plans: AdminPlanOverviewItem[];
}

export interface AdminOverviewResponse {
  cached: boolean;
  generated_at: string;
  month_utc: string;
  kpis: {
    total_users: number;
    new_users_month: number;
    active_users: number;
    suspended_users: number;
    disabled_users: number;
    deleted_accounts: number;
    paid_subscribers: number;
    trial_users: number;
    estimated_mrr_usd: number;
    expiring_7d: number;
    overdue: number;
    pending_payments_count: number;
    pending_payments_usd: number;
    pending_payments_alert_count?: number;
    pending_payments_alert_usd?: number;
    pending_payments_pkr: number;
    revenue_month_usd: number;
    revenue_month_pkr: number;
    revenue_all_time_usd: number;
    cost_month_usd: number;
    cost_today_usd: number;
    tokens_month: number;
    posts_generated_month: number;
    posts_published_month: number;
    failed_runs_month: number;
    failed_emails_count: number;
    email_median_send_ms_24h?: number | null;
    email_failure_rate_24h?: number;
    email_sent_24h?: number;
    email_failed_24h?: number;
    email_queued_now?: number;
  };
  daily_series: Array<{
    date: string;
    short_date: string;
    revenue_usd: number;
    cost_usd: number;
    generated: number;
    published: number;
    failed: number;
  }>;
  plan_breakdown: Array<{
    plan_id: string;
    plan_name: string;
    total: number;
    active: number;
  }>;
  pending_payments: Array<{
    id: string;
    user_id: string;
    user_email: string;
    plan_name: string;
    billing_interval: string;
    amount_usd: number;
    amount_pkr: number;
    method: string;
    transaction_id: string;
    submitted_at: string | null;
  }>;
  recent_audit_logs: Array<{
    id: string;
    actor_email: string;
    action: string;
    target_type: string;
    target_id: string | null;
    target_email: string | null;
    reason: string | null;
    email_status: string | null;
    created_at: string | null;
  }>;
}
