"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { searchAction, type SearchState } from "@/lib/actions/search";
import { SearchResults } from "@/components/search-results";
import { SearchResultsSkeleton } from "@/components/search-results-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// render=explicit: NO auto-renderiza; lo montamos nosotros con turnstile.render
// para controlar su ciclo de vida (clave al navegar entrando/saliendo del home).
const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const initialState: SearchState = { status: "idle" };

// Tipo mínimo del API global de Turnstile (render/reset/remove).
interface TurnstileApi {
  render: (el: HTMLElement, opts: { sitekey: string }) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Buscador público (concepto A1). Tres campos Nombre · Apellido · Cédula que se
 * combinan en el RPC mediado vía Server Action, previa verificación Turnstile.
 * Los resultados se renderizan aquí mismo (la búsqueda ya no vive en la URL).
 */
export function SearchPanel(): React.ReactElement {
  const [state, formAction, pending] = useActionState(searchAction, initialState);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  // El widget de Turnstile mide 300×65 fijos; en pantallas angostas se escala para
  // caber dentro del card sin desbordarse (no se puede recortar: su marca debe verse).
  const widgetWrapRef = useRef<HTMLDivElement>(null);
  const [widgetScale, setWidgetScale] = useState(1);

  // Render EXPLÍCITO con limpieza al desmontar: al volver al home (navegación SPA)
  // se monta un widget nuevo y se elimina el anterior, sin quedar huérfano ni sin token.
  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const cleanup = (): void => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    const tryRender = (): boolean => {
      if (cancelled || widgetIdRef.current) return true;
      if (!containerRef.current || !window.turnstile) return false;
      widgetIdRef.current = window.turnstile.render(containerRef.current, { sitekey: siteKey });
      return true;
    };

    if (tryRender()) return cleanup;
    // El script aún no cargó: reintenta hasta que window.turnstile exista.
    const iv = setInterval(() => {
      if (tryRender()) clearInterval(iv);
    }, 150);
    return () => {
      cancelled = true;
      clearInterval(iv);
      cleanup();
    };
  }, [siteKey]);

  // Recalcula la escala del widget según el ancho disponible (300px = ancho nativo).
  useEffect(() => {
    if (!siteKey) return;
    const el = widgetWrapRef.current;
    if (!el) return;
    const compute = (): void => {
      const w = el.clientWidth;
      setWidgetScale(w > 0 ? Math.min(1, w / 300) : 1);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [siteKey]);

  // El token Turnstile es de un solo uso: tras cada búsqueda se reinicia el widget.
  useEffect(() => {
    if (state.status !== "idle" && widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [state]);

  // En móvil los resultados quedan bajo el formulario: al iniciar/terminar la
  // búsqueda, llevamos la vista a esa zona para que no haya que hacer scroll a mano.
  useEffect(() => {
    if (pending || state.status !== "idle") {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [pending, state]);

  return (
    <div className="space-y-6">
      {siteKey && <Script src={TURNSTILE_API} strategy="afterInteractive" />}

      <Card>
        <CardBody className="space-y-5">
          <form action={formAction} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4 md:items-end">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-text-2">
                  Nombre
                </label>
                <Input id="name" name="name" placeholder="Ej. María" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="surname" className="text-sm font-medium text-text-2">
                  Apellido
                </label>
                <Input
                  id="surname"
                  name="surname"
                  placeholder="Ej. Rondón"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="documentId" className="text-sm font-medium text-text-2">
                  Cédula <span className="text-text-3">(opcional)</span>
                </label>
                <Input
                  id="documentId"
                  name="documentId"
                  placeholder="Ej. 12345678"
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? "Buscando…" : "Buscar"}
              </Button>
            </div>

            {siteKey && (
              <div ref={widgetWrapRef} className="w-full">
                {/* Caja de tamaño escalado (evita desbordar/hueco); el widget se escala desde su esquina. */}
                <div
                  className="mx-auto"
                  style={{ width: `${300 * widgetScale}px`, height: `${65 * widgetScale}px` }}
                >
                  <div
                    ref={containerRef}
                    style={{
                      width: 300,
                      height: 65,
                      transform: `scale(${widgetScale})`,
                      transformOrigin: "top left",
                    }}
                  />
                </div>
              </div>
            )}

            <p className="text-sm text-text-2">
              Solo verás el hospital y un teléfono de ayuda. Nada de datos médicos.
            </p>
          </form>
        </CardBody>
      </Card>

      {/* Ancla de scroll: la vista salta aquí al buscar (clave en móvil). */}
      <div ref={resultsRef} className="scroll-mt-4" />

      {pending && <SearchResultsSkeleton />}

      {!pending && state.status === "verification-failed" && (
        <Card className="border-warning/30 bg-warning/5">
          <CardBody className="space-y-2" role="status" aria-live="polite">
            <h2 className="text-lg font-semibold text-text">No pudimos verificar la solicitud</h2>
            <p className="text-text-2">
              Vuelve a intentar la búsqueda. Si el problema persiste, recarga la página.
            </p>
          </CardBody>
        </Card>
      )}

      {!pending && state.status === "done" && <SearchResults result={state.result} />}
    </div>
  );
}
