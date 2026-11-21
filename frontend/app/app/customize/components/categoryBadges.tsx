import * as React from "react";
import {
  AlignLeft,
  Anchor,
  Ban,
  BookOpen,
  Briefcase,
  Building2,
  Calendar,
  Code2,
  Compass,
  CornerDownRight,
  Flame,
  FileText,
  Globe,
  Hash,
  LayoutList,
  MessageSquare,
  Mic,
  MousePointerClick,
  Package,
  Ruler,
  Tag,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CategoryTone = "info" | "violet" | "teal" | "warning" | "danger" | "neutral";

const TONE_CLASSES: Record<CategoryTone, string> = {
  info: "bg-status-info-bg text-status-info-fg border-status-info-border",
  violet: "bg-status-violet-bg text-status-violet-fg border-status-violet-border",
  teal: "bg-status-teal-bg text-status-teal-fg border-status-teal-border",
  warning: "bg-status-warning-bg text-status-warning-fg border-status-warning-border",
  danger: "bg-status-danger-bg text-status-danger-fg border-status-danger-border",
  neutral: "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
};

interface BadgeSpec {
  tone: CategoryTone;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const CATEGORY_MAP: Record<string, BadgeSpec> = {
  company: { tone: "info", label: "Company", Icon: Building2 },
  product: { tone: "violet", label: "Product", Icon: Package },
  team: { tone: "teal", label: "Team", Icon: Users },
  metric: { tone: "warning", label: "Metric", Icon: TrendingUp },
  result: { tone: "warning", label: "Result", Icon: TrendingUp },
  customer: { tone: "info", label: "Customer", Icon: Briefcase },
  market: { tone: "info", label: "Market", Icon: Briefcase },
  pricing: { tone: "warning", label: "Pricing", Icon: Tag },
  mission: { tone: "violet", label: "Mission", Icon: Compass },
  differentiator: { tone: "violet", label: "Differentiator", Icon: Compass },
  event: { tone: "teal", label: "Event", Icon: Calendar },
  events: { tone: "teal", label: "Events", Icon: Calendar },
  "career origin": { tone: "violet", label: "Career origin", Icon: Compass },
  management: { tone: "info", label: "Management", Icon: Users },
  "current role": { tone: "warning", label: "Current role", Icon: Briefcase },
  hook: { tone: "info", label: "Hook", Icon: Anchor },
  body: { tone: "teal", label: "Body", Icon: AlignLeft },
  ending: { tone: "violet", label: "Ending", Icon: CornerDownRight },
  format: { tone: "neutral", label: "Format", Icon: LayoutList },
  voice: { tone: "violet", label: "Voice", Icon: Mic },
  cta: { tone: "warning", label: "CTA", Icon: MousePointerClick },
  topic: { tone: "info", label: "Topic", Icon: MessageSquare },
  hashtags: { tone: "teal", label: "Hashtags", Icon: Hash },
  length: { tone: "warning", label: "Length", Icon: Ruler },
  banned: { tone: "danger", label: "Banned", Icon: Ban },
  other: { tone: "neutral", label: "Other", Icon: Tag },
};

const SCOPE_MAP: Record<string, BadgeSpec> = {
  all: { tone: "neutral", label: "All", Icon: Globe },
  build_in_public: { tone: "info", label: "Build in public", Icon: Code2 },
  technical_explainer: { tone: "violet", label: "Explainer", Icon: BookOpen },
  hot_take: { tone: "warning", label: "Hot take", Icon: Flame },
  project_showcase_video: { tone: "teal", label: "Video showcase", Icon: Video },
  first_comment_action: { tone: "teal", label: "First comment", Icon: MessageSquare },
};

const KIND_MAP: Record<string, BadgeSpec> = {
  business: { tone: "info", label: "Business", Icon: Building2 },
  playbook: { tone: "violet", label: "Playbook", Icon: BookOpen },
  previous_posts: { tone: "teal", label: "Previous posts", Icon: FileText },
};

function formatFallbackLabel(raw: string): string {
  const clean = raw.replace(/_/g, " ").trim();
  if (!clean) return "Other";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function getCategorySpec(category: string): BadgeSpec {
  const key = (category || "other").trim().toLowerCase();
  return CATEGORY_MAP[key] ?? {
    tone: "neutral",
    label: formatFallbackLabel(category),
    Icon: Tag,
  };
}

export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const { tone, label, Icon } = getCategorySpec(category);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ScopeBadge({ scope, className }: { scope?: string | null; className?: string }) {
  const key = (scope || "all").trim().toLowerCase();
  const { tone, label, Icon } = SCOPE_MAP[key] ?? SCOPE_MAP.all;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function DocumentKindBadge({ kind, className }: { kind: string; className?: string }) {
  const key = (kind || "").trim().toLowerCase();
  const { tone, label, Icon } = KIND_MAP[key] ?? {
    tone: "neutral" as CategoryTone,
    label: formatFallbackLabel(kind),
    Icon: FileText,
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      <Icon className="size-4 shrink-0 stroke-[1.75]" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
