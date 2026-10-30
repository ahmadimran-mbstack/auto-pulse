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
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
