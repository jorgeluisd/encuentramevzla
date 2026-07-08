"use client";

import * as React from "react";
import type { LegalItem } from "@/lib/legal/publication-terms";
import { Button } from "@/components/ui/button";

// Modal de solo lectura para textos legales (términos, cláusulas). Se monta sobre la
// página sin desmontar el formulario que hay debajo → no se pierde lo ya cargado.
export function LegalModal({
  open,
  onClose,
  title,
  intro,
  items,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  intro?: string;
  items: readonly LegalItem[];
}): React.ReactElement | null {
  const titleId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-bg shadow-[var(--shadow-card)] sm:rounded-[var(--radius-card)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-1 w-full shrink-0" aria-hidden="true">
          <div className="flex-1 bg-flag-yellow" />
          <div className="flex-1 bg-flag-blue" />
          <div className="flex-1 bg-flag-red" />
        </div>

        <div className="overflow-y-auto px-6 pt-6 pb-2">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight text-text">
            {title}
          </h2>
          {intro && <p className="mt-2 text-sm text-text-2">{intro}</p>}
          <ul className="mt-4 space-y-4">
            {items.map((item) => (
              <li key={item.title} className="text-sm leading-relaxed">
                <p className="font-semibold text-text">{item.title}</p>
                <p className="mt-1 text-text-2">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 border-t border-border bg-surface px-6 py-4">
          <Button type="button" size="lg" className="w-full" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
