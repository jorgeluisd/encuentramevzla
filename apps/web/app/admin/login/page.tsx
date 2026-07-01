"use client";

import { useState } from "react";
import { createSsrBrowserClient } from "@/lib/supabase/ssr-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";

/**
 * `/admin/login` — Acceso del equipo (magic-link). Pide el enlace al correo
 * institucional; quién entra de verdad lo decide el guard (allow-list). Sin
 * contraseñas.
 */
export default function LoginPage(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "verifying">("idle");
  const [error, setError] = useState<string | null>(null);

  // Pide el acceso: envía el correo con código de 6 dígitos + enlace de respaldo.
  async function requestAccess(): Promise<boolean> {
    const supabase = createSsrBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (otpError) {
      setError("No pudimos enviar el código. Verifica el correo e intenta de nuevo.");
      return false;
    }
    return true;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const ok = await requestAccess();
    setStatus(ok ? "sent" : "idle");
  }

  // Verifica el código de 6 dígitos. Se valida server-side contra email+token, sin depender
  // de la cookie del navegador → funciona aunque el correo se haya abierto en otro dispositivo.
  async function onVerify(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("verifying");
    setError(null);
    const supabase = createSsrBrowserClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });
    if (verifyError) {
      setError("Código inválido o vencido. Pide uno nuevo.");
      setStatus("sent");
      return;
    }
    // Sesión creada en este navegador: navegación completa para que el guard lea las cookies.
    window.location.assign("/admin/ingesta");
  }

  async function onResend(): Promise<void> {
    setStatus("sending");
    setError(null);
    const ok = await requestAccess();
    setStatus("sent");
    if (ok) setCode("");
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Acceso del equipo</h1>
        <p className="text-text-2">
          Personal de hospitales y voluntariado verificado.
        </p>
      </header>

      <Card>
        <CardBody>
          {status === "sent" || status === "verifying" ? (
            <div className="space-y-4">
              <div role="status" aria-live="polite" className="space-y-1">
                <p className="font-semibold text-text">Revisa tu correo</p>
                <p className="text-sm text-text-2">
                  Enviamos un código a <span className="font-medium">{email}</span>. Escríbelo
                  aquí. Caduca en 15 minutos.
                </p>
              </div>
              <form onSubmit={onVerify} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="code" className="text-sm font-medium text-text-2">
                    Código de acceso
                  </label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={10}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                    placeholder="12345678"
                    className="text-center text-lg tracking-[0.3em]"
                  />
                </div>
                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}
                <Button
                  type="submit"
                  disabled={status === "verifying" || code.length < 6}
                  className="w-full"
                >
                  {status === "verifying" ? "Entrando…" : "Entrar"}
                </Button>
              </form>
              <div className="flex flex-wrap gap-3 text-sm">
                <button
                  type="button"
                  onClick={onResend}
                  className="font-medium text-primary hover:underline"
                >
                  Reenviar código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus("idle");
                    setEmail("");
                    setCode("");
                    setError(null);
                  }}
                  className="text-text-2 hover:underline"
                >
                  Usar otro correo
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium text-text-2">
                  Correo institucional
                </label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@hospital.org"
                  autoComplete="email"
                />
              </div>
              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={status === "sending"} className="w-full">
                {status === "sending" ? "Enviando…" : "Enviar enlace de acceso"}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <p className="text-center text-xs text-text-3">
        Acceso restringido. Cada lista cargada pasa por deduplicación y validación
        humana.
      </p>
    </div>
  );
}
