import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground transition-[border-color] duration-200 ease-in-out outline-none placeholder:text-muted-foreground focus:border-input-focus focus:outline-none focus:ring-0 focus-visible:border-input-focus focus-visible:outline-none focus-visible:ring-0 shadow-none focus:shadow-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
