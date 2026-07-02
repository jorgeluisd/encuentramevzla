import * as React from "react";
import { cn } from "@/lib/utils";

/** Card estilo shadcn/ui sobre tokens (radio ~18px, sombra azulada suave). */
export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref): React.ReactElement {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--radius-card)] border border-border bg-bg shadow-[var(--shadow-card)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("p-5 sm:p-6", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>): React.ReactElement {
  return (
    <h3
      className={cn("text-lg font-semibold text-text", className)}
      {...props}
    />
  );
}
