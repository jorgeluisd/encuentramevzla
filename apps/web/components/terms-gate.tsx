"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

// Versión de los términos: si el texto cambia, sube la versión para re-pedir
// aceptación a quienes ya habían aceptado la anterior.
const STORAGE_KEY = "evzla:terms-accepted:v1";

// Cláusula de protección y uso de datos personales. Cada punto: título + cuerpo.
const CLAUSES = [
  {
    title: "Finalidad del tratamiento de datos",
    body: "La información personal y los datos recabados a través de esta aplicación son tratados única y exclusivamente con el fin de facilitar la búsqueda y localización de familiares, amigos o conocidos, incluyendo niñas, niños, adolescentes y personas que se presumen desaparecidas.",
  },
  {
    title: "Interés superior del niño",
    body: "El tratamiento de la información de niñas, niños y adolescentes se realiza en estricto cumplimiento del principio del interés superior, conforme a la normativa venezolana vigente.",
  },
  {
    title: "Reserva de derechos",
    body: "Los desarrolladores de esta aplicación se reservan el derecho de ejercer las acciones legales correspondientes ante los organismos de seguridad competentes frente a cualquier uso inadecuado de la información aquí contenida, en virtud de que la misma tiene como finalidad exclusiva la ubicación de las personas señaladas.",
  },
  {
    title: "Limitación de responsabilidad",
    body: "La aplicación no se hace responsable por el uso, divulgación o manejo de la información compartida con fines distintos a los anteriormente señalados.",
  },
  {
    title: "Advertencia de seguridad",
    body: "Se recomienda al usuario actuar con extrema precaución, siendo consciente de que cualquier uso indebido de los datos personales, contrario a la presente iniciativa, puede generar responsabilidades penales, civiles o administrativas, pudiendo derivar en denuncias o acciones realizadas en nombre propio o en conjunto con familiares.",
  },
] as const;

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
          <p className="mt-2 text-sm text-text-2">
            Al hacer uso de esta aplicación en situaciones de emergencia, usted
            acepta y reconoce expresamente lo siguiente:
          </p>

          <ul className="mt-4 space-y-4">
            {CLAUSES.map((clause) => (
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
