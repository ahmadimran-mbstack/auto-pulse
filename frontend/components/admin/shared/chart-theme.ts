import type { ChartConfig } from "@/components/ui/chart";

export const ADMIN_CHART_COLORS = {
  blue: "var(--chart-1)",
  emerald: "var(--chart-2)",
  violet: "var(--chart-3)",
  amber: "var(--chart-4)",
  red: "var(--chart-5)",
} as const;

export const CHART_GRID_PROPS = {
  vertical: false,
  strokeDasharray: "3 3",
  className: "stroke-border/70",
} as const;

export const CHART_AXIS_PROPS = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
} as const;

export const ADMIN_REV_COST_CHART_CONFIG = {
  revenue_usd: {
    label: "Approved revenue ($)",
    color: ADMIN_CHART_COLORS.blue,
  },
  cost_usd: {
    label: "AI & search cost ($)",
    color: ADMIN_CHART_COLORS.emerald,
  },
} satisfies ChartConfig;

export const ADMIN_PLAN_CHART_CONFIG = {
  active: {
    label: "Active",
    color: ADMIN_CHART_COLORS.violet,
  },
  total: {
    label: "Total",
    color: ADMIN_CHART_COLORS.blue,
  },
} satisfies ChartConfig;

export const ADMIN_ACTIVITY_CHART_CONFIG = {
  generated: {
    label: "Generated",
    color: ADMIN_CHART_COLORS.blue,
  },
  published: {
    label: "Published",
    color: ADMIN_CHART_COLORS.emerald,
  },
  failed: {
    label: "Failed",
    color: ADMIN_CHART_COLORS.red,
  },
} satisfies ChartConfig;
