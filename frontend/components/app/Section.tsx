import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionProps extends React.ComponentProps<"section"> {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

// Section organizes page content with a semantic heading, description, and clear visual separation
export function Section({
  title,
  description,
  actions,
  children,
  className,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn("flex flex-col gap-4 py-8 border-b border-border first:pt-0 last:border-b-0", className)}
      {...props}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-foreground tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="pt-2">{children}</div>
    </section>
  );
}
