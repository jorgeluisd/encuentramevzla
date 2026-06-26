import * as React from "react";
import { cn } from "@/lib/utils";

/** Badge tipo píldora (estado/confianza). Tinte suave de fondo + texto del rol. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "primary" | "success" | "warning" | "danger" | "muted";
}

export function Badge({
  className,
  variant = "muted",
  ...props
}: BadgeProps): React.ReactElement {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
        variant === "primary" && "bg-primary/10 text-primary",
        variant === "success" && "bg-success/10 text-success",
        variant === "warning" && "bg-warning/10 text-warning",
        variant === "danger" && "bg-danger/10 text-danger",
        variant === "muted" && "bg-surface-alt text-muted",
        className,
      )}
      {...props}
    />
  );
}
