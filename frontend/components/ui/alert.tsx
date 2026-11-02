import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-2.5 py-2 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground",
        destructive:
          "bg-status-danger-bg border-status-danger-arc/40 text-status-danger-fg *:data-[slot=alert-description]:text-status-danger-fg/90 *:[svg]:text-status-danger-fg",
        warning:
          "bg-status-warning-bg border-status-warning-arc/40 text-status-warning-fg *:data-[slot=alert-description]:text-status-warning-fg/90 *:[svg]:text-status-warning-fg",
        success:
          "bg-status-success-bg border-status-success-arc/40 text-status-success-fg *:data-[slot=alert-description]:text-status-success-fg/90 *:[svg]:text-status-success-fg",
        danger:
          "bg-status-danger-bg border-status-danger-arc/40 text-status-danger-fg *:data-[slot=alert-description]:text-status-danger-fg/90 *:[svg]:text-status-danger-fg",
        info:
          "bg-status-info-bg border-status-info-arc/40 text-status-info-fg *:data-[slot=alert-description]:text-status-info-fg/90 *:[svg]:text-status-info-fg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-action"
      className={cn("absolute top-2 right-2", className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
