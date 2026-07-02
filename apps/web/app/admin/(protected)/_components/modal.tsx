"use client";

import { useEffect } from "react";

// Modal ligero (sin dependencia): overlay + tarjeta, cierra con Esc o click fuera.
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}): React.ReactElement | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-[var(--radius-control)] border border-border bg-bg p-5 shadow-lg">
        {title && <h2 className="mb-4 text-lg font-semibold text-text">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
