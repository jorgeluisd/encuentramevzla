"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DATA_PROTECTION_CLAUSES,
  DATA_PROTECTION_INTRO,
} from "@/lib/legal/data-protection-clause";

// Versión de los términos: si el texto cambia, sube la versión para re-pedir
// aceptación a quienes ya habían aceptado la anterior.
const STORAGE_KEY = "evzla:terms-accepted:v1";

export function TermsGate(): React.ReactElement | null {
  // undefined = aún sin resolver (evita parpadeo/hydration mismatch en SSR).
  const [accepted, setAccepted] = React.useState<boolean | undefined>(undefined);
  const titleId = React.useId();

  React.useEffect(() => {
    try {
      setAccepted(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Si localStorage no está disponible, no bloqueamos la navegación.
      setAccepted(true);
    }
  }, []);

  const open = accepted === false;

  // El botón solo se habilita tras leer (scrollear) toda la cláusula. Si el
  // contenido no desborda (desktop), se considera leída de entrada.
  const [reachedEnd, setReachedEnd] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const checkReachedEnd = React.useCallback((el: HTMLDivElement): void => {
    // Margen de 8px por redondeos de subpíxel al final del scroll.
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 8 ||
      el.scrollHeight <= el.clientHeight;
    if (atBottom) setReachedEnd(true);
  }, []);

  // Bloquea el scroll del fondo mientras el modal está abierto.
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function handleAccept(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // No pudimos persistir; igual dejamos pasar en esta sesión.
    }
    setAccepted(true);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[var(--radius-card)] bg-bg shadow-[var(--shadow-card)] sm:rounded-[var(--radius-card)]">
        {/* Franja tricolor: refuerza pertenencia de marca en el gate de entrada. */}
        <div className="flex h-1 w-full shrink-0" aria-hidden="true">
          <div className="flex-1 bg-flag-yellow" />
          <div className="flex-1 bg-flag-blue" />
          <div className="flex-1 bg-flag-red" />
        </div>

        <div
          ref={(el) => {
            scrollRef.current = el;
            // Mide al montar: en desktop suele no haber overflow → habilita ya.
            if (el) checkReachedEnd(el);
          }}
          onScroll={(e) => checkReachedEnd(e.currentTarget)}
          className="overflow-y-auto px-6 pt-6 pb-2"
        >
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight text-text"
          >
            Cláusula de protección y uso de datos personales
          </h2>
          <p className="mt-2 text-sm text-text-2">{DATA_PROTECTION_INTRO}</p>

          <ul className="mt-4 space-y-4">
            {DATA_PROTECTION_CLAUSES.map((clause) => (
              <li key={clause.title} className="text-sm leading-relaxed">
                <p className="font-semibold text-text">{clause.title}</p>
                <p className="mt-1 text-text-2">{clause.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="shrink-0 border-t border-border bg-surface px-6 py-4">
          {!reachedEnd && (
            <p className="mb-2 text-center text-xs text-text-2" aria-live="polite">
              Desliza hasta el final para continuar
            </p>
          )}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={!reachedEnd}
            onClick={handleAccept}
          >
            Acepto y deseo continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
