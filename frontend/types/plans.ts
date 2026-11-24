export type PlanId = "trial" | "starter" | "pro" | "business" | "internal";
export type SubscriptionStatus = "trialing" | "active" | "expired" | "canceled";
export type AnalyticsLevel = "none" | "basic" | "full";

export interface PublicPlan {
  id: Exclude<PlanId, "internal">;
  name: string;
  monthly_price_usd: number;
  monthly_price_pkr_approx: number;
  annual_price_usd: number | null;
  annual_price_pkr_approx: number | null;
  annual_monthly_equivalent_usd: number | null;
  annual_monthly_equivalent_pkr_approx: number | null;
  plan_length_days: number;
  limits: {
    linkedin_profiles: number;
    scheduled_posts: number;
    playground_runs: number;
    playground_runs_per_day: number;
    max_post_days_per_week: number;
  };
  features: {
    approval_email: boolean;
    approval_slack: boolean;
    docs_token_limit: number;
    analytics_level: AnalyticsLevel;
    support: string;
  };
}

export interface PublicPlansResponse {
  currency: "USD";
  pkr_per_usd: number;
  annual_discount: number;
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

export type PaymentMethod = "easypaisa" | "jazzcash";
export type PaymentStatus = "pending" | "approved" | "rejected";

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
}

export interface BillingStatusResponse {
  plan_id: PlanId;
  plan_name: string;
  status: SubscriptionStatus;
  billing_interval: "monthly" | "annual" | null;
  period_end: string | null;
  days_left: number | null;
  pending_payment: BillingPaymentItem | null;
  payments: BillingPaymentItem[];
}

export interface CheckoutInfoResponse {
  plan_id: "starter" | "pro" | "business";
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
}
