import type { InputHTMLAttributes, ReactElement } from "react";
import { cn } from "@/lib/utils";

// Campo de archivo Excel reutilizable (Cargar / Ingesta): botón "Seleccionar" visible
// (file: pseudo-element), crece para llenar la fila y deja el submit en la misma línea.
export function ExcelUploadField({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  return (
    <input
      type="file"
      accept=".xlsx,.xls"
      className={cn(
        "min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-surface p-3 text-sm text-text-2",
        "file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-medium file:text-white",
        "disabled:opacity-60",
        className,
      )}
      {...props}
    />
  );
}
