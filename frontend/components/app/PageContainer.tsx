import * as React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1152px] px-4 sm:px-6 py-6 sm:py-8 space-y-6",
        className
      )}
    >
      {children}
    </div>
  );
}
