"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

const TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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

// Widget Turnstile con render explícito y limpieza al desmontar. `resetSignal`
// reinicia el token (de un solo uso) tras cada envío. Si no hay site key, no renderiza.
export function TurnstileField({ resetSignal }: { resetSignal?: unknown }): React.ReactElement | null {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

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
    const iv = setInterval(() => {
      if (tryRender()) clearInterval(iv);
    }, 150);
    return () => {
      cancelled = true;
      clearInterval(iv);
      cleanup();
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetSignal !== undefined && widgetIdRef.current) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <>
      <Script src={TURNSTILE_API} strategy="afterInteractive" />
      <div ref={containerRef} />
    </>
  );
}
