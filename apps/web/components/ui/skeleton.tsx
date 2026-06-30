import * as React from "react";
import { cn } from "@/lib/utils";

/** Bloque "esqueleto" con pulso: placeholder mientras carga un segmento (loading.tsx). */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--radius-control)] bg-surface-alt", className)}
      aria-hidden="true"
      {...props}
    />
  );
}
