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
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createSsrBrowserClient();
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (otpError) {
      setError("No pudimos enviar el enlace. Verifica el correo e intenta de nuevo.");
      setStatus("idle");
      return;
    }
    setStatus("sent");
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
          {status === "sent" ? (
            <div className="space-y-3" role="status" aria-live="polite">
              <p className="font-semibold text-text">Revisa tu correo</p>
              <p className="text-sm text-text-2">
                Enviamos un enlace de acceso a{" "}
                <span className="font-medium">{email}</span>. Caduca en 15 minutos.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setStatus("idle");
                  setEmail("");
                }}
              >
                Usar otro correo
              </Button>
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
