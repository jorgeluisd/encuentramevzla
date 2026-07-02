"use client";

import { useState, type InputHTMLAttributes, type ReactElement } from "react";
import { cn } from "@/lib/utils";

// Campo de archivo Excel reutilizable (Cargar / Ingesta). Control propio: botón visible +
// nombre del archivo que controlamos nosotros (el texto nativo "sin archivos" se trunca feo
// en móvil). El input real cubre el botón en opacity-0 para abrir el selector y validar `required`.
export function ExcelUploadField({
  className,
  disabled,
  onChange,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): ReactElement {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] border border-border bg-surface p-2",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="relative shrink-0">
        <span className="pointer-events-none inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-white">
          Seleccionar archivo
        </span>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={disabled}
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            onChange?.(e);
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
      </div>
      <span
        className={cn("min-w-0 flex-1 truncate text-sm", fileName ? "text-text-2" : "text-text-3")}
        title={fileName ?? undefined}
      >
        {fileName ?? "Ningún archivo seleccionado"}
      </span>
    </div>
  );
}
