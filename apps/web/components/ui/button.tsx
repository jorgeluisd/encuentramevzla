import * as React from "react";
import { cn } from "@/lib/utils";

/** Botón estilo shadcn/ui sobre tokens del proyecto (specs/0003 §5). */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "danger";
  size?: "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      className={cn(
        // base: target táctil cómodo, foco visible
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "md" && "h-[52px] px-5 text-base",
        size === "lg" && "h-[56px] px-6 text-base",
        variant === "primary" && "bg-primary text-white hover:bg-primary/90",
        variant === "outline" &&
          "border border-border bg-bg text-text hover:bg-surface",
        variant === "danger" && "bg-danger text-white hover:bg-danger/90",
        className,
      )}
      {...props}
    />
  );
}
