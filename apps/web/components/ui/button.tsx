import * as React from "react";
import { cn } from "@/lib/utils";

/** Botón mínimo estilo shadcn/ui (sin variantes completas; solo estructura). */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline";
}

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-teal-700 text-white hover:bg-teal-800",
        variant === "outline" &&
          "border border-gray-300 bg-white text-gray-900 hover:bg-gray-50",
        className,
      )}
      {...props}
    />
  );
}
