export type PlanId = string;
export type SubscriptionStatus = "trialing" | "active" | "expired" | "canceled";
export type AnalyticsLevel = "none" | "basic" | "full";

export interface PublicPlan {
  id: PlanId;
  name: string;
  monthly_price_usd: number | null;
  monthly_price_pkr_approx: number | null;
  annual_price_usd: number | null;
  annual_price_pkr_approx: number | null;
  annual_monthly_equivalent_usd: number | null;
  annual_monthly_equivalent_pkr_approx: number | null;
  plan_length_days: number;
  sort_order?: number;
  is_popular?: boolean;
  is_system?: boolean;
  is_purchasable?: boolean;
  extra_features?: string[];
  limits: {
    linkedin_profiles: number | null;
    scheduled_posts: number | null;
    playground_runs: number | null;
    playground_runs_per_day: number | null;
    max_post_days_per_week: number | null;
  };
  features: {
    approval_email: boolean;
    approval_slack: boolean;
    docs_token_limit: number | null;
    analytics_level: AnalyticsLevel;
    support: string;
  };
}

export interface PublicPlansResponse {
  currency: "USD";
  pkr_per_usd: number;
  annual_discount: number;
  trial_days?: number;
  plans: PublicPlan[];
}

export interface UserEntitlements {
  plan_id: PlanId;
  plan_name: string;
  status: SubscriptionStatus;
  billing_interval: "monthly" | "annual" | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  limits: {
    linkedin_profiles: number | null;
    scheduled_posts: number | null;
    playground_runs: number | null;
    playground_runs_per_day: number | null;
    max_post_days_per_week: number | null;
    daily_spend_limit_usd: number | null;
  };
  features: {
    approval_email: boolean;
    approval_slack: boolean;
    docs_token_limit: number | null;
    analytics_level: AnalyticsLevel;
    support: string;
  };
  usage: {
    scheduled_used: number;
    scheduled_limit: number | null;
    playground_used: number;
    playground_limit: number | null;
    playground_today_used: number;
    playground_today_limit: number | null;
    docs_tokens_used: number;
    docs_token_limit: number | null;
  };
}

export type PaymentMethod = "easypaisa" | "jazzcash" | "manual" | "cash" | "bank_transfer";
export type PaymentStatus = "pending" | "approved" | "rejected" | "voided";

export interface BillingPaymentItem {
  id: string;
  plan_id: string;
  plan_name: string;
  billing_interval: "monthly" | "annual";
  amount_usd_cents: number;
  amount_usd: number;
  amount_pkr: number;
  method: PaymentMethod;
  transaction_id: string;
  status: PaymentStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  source?: string;
  note?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
}

export interface BillingStatusResponse {
  plan_id: PlanId;
  plan_name: string;
  is_active?: boolean;
  is_system?: boolean;
  monthly_price_usd?: number | null;
  annual_price_usd?: number | null;
  annual_discount?: number;
  trial_days?: number;
  status: SubscriptionStatus;
  billing_interval: "monthly" | "annual" | null;
  period_end: string | null;
  days_left: number | null;
  pending_payment: BillingPaymentItem | null;
  payments: BillingPaymentItem[];
}

export interface CheckoutInfoResponse {
  plan_id: string;
  plan_name: string;
  billing_interval: "monthly" | "annual";
  amount_usd_cents: number;
  amount_usd: number;
  amount_pkr: number;
  account_title: string;
  account_last4: string;
  methods: PaymentMethod[];
}

export interface AdminPaymentItem extends BillingPaymentItem {
  user_id: string;
  user_email: string;
  reviewed_by: string | null;
  recorded_by?: string | null;
}
