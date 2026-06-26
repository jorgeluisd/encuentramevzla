import * as React from "react";
import { cn } from "@/lib/utils";

/** Input estilo shadcn/ui: alto 52px, texto >=16px (anti-zoom iOS), foco visible. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input({ className, ...props }, ref): React.ReactElement {
    return (
      <input
        ref={ref}
        className={cn(
          "h-[52px] w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text",
          "placeholder:text-text-3",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
