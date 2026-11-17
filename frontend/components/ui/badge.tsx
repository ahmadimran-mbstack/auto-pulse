import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

// Badge variants using status tokens and primary/secondary tokens
const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-border bg-transparent text-foreground",
        info: "border-transparent bg-status-info-bg text-status-info-fg",
        success: "border-transparent bg-status-success-bg text-status-success-fg",
        warning: "border-transparent bg-status-warning-bg text-status-warning-fg",
        danger: "border-transparent bg-status-danger-bg text-status-danger-fg",
        neutral: "border-transparent bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300",
        // Backward compatibility mappings
        draft: "border-transparent bg-status-warning-bg text-status-warning-fg",
        approved: "border-transparent bg-status-success-bg text-status-success-fg",
        published: "border-transparent bg-status-success-bg text-status-success-fg",
        // Landing page semantic badge variants
        "landing-topic":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-topic-border)] bg-[var(--lp-badge-topic-bg)] text-[var(--lp-badge-topic-fg)] [a&]:hover:border-[var(--lp-badge-topic-border-hover)] [a:hover_&]:border-[var(--lp-badge-topic-border-hover)]",
        "landing-hook":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-hook-border)] bg-[var(--lp-badge-hook-bg)] text-[var(--lp-badge-hook-fg)] [a&]:hover:border-[var(--lp-badge-hook-border-hover)] [a:hover_&]:border-[var(--lp-badge-hook-border-hover)]",
        "landing-writer":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-writer-border)] bg-[var(--lp-badge-writer-bg)] text-[var(--lp-badge-writer-fg)] [a&]:hover:border-[var(--lp-badge-writer-border-hover)] [a:hover_&]:border-[var(--lp-badge-writer-border-hover)]",
        "landing-checker":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-checker-border)] bg-[var(--lp-badge-checker-bg)] text-[var(--lp-badge-checker-fg)] [a&]:hover:border-[var(--lp-badge-checker-border-hover)] [a:hover_&]:border-[var(--lp-badge-checker-border-hover)]",
        "landing-human":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-human-border)] bg-[var(--lp-badge-human-bg)] text-[var(--lp-badge-human-fg)] [a&]:hover:border-[var(--lp-badge-human-border-hover)] [a:hover_&]:border-[var(--lp-badge-human-border-hover)]",
        "landing-eyebrow":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-eyebrow-border)] bg-[var(--lp-badge-eyebrow-bg)] text-[var(--lp-badge-eyebrow-fg)]",
        "landing-neutral":
          "h-6 sm:h-[26px] rounded-full px-2.5 py-1 text-xs font-medium leading-none [&>svg]:size-3.5 border-[var(--lp-badge-neutral-border)] bg-[var(--lp-badge-neutral-bg)] text-[var(--lp-badge-neutral-fg)] [a&]:hover:border-[var(--lp-badge-neutral-border-hover)] [a:hover_&]:border-[var(--lp-badge-neutral-border-hover)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

// Maps each landing badge variant to its 400-shade status dot token.
const LANDING_DOT_COLOR: Record<string, string> = {
  "landing-topic": "var(--lp-badge-topic-dot)",
  "landing-hook": "var(--lp-badge-hook-dot)",
  "landing-writer": "var(--lp-badge-writer-dot)",
  "landing-checker": "var(--lp-badge-checker-dot)",
  "landing-human": "var(--lp-badge-human-dot)",
  "landing-eyebrow": "var(--lp-badge-eyebrow-dot)",
  "landing-neutral": "var(--lp-badge-neutral-dot)",
};

function Badge({
  className,
  variant = "default",
  asChild = false,
  dot,
  children,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean; dot?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";
  const showDot = dot ?? variant === "landing-eyebrow";
  const dotColor = variant ? LANDING_DOT_COLOR[variant] : undefined;

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    >
      {showDot && dotColor && !asChild && (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge, badgeVariants };
