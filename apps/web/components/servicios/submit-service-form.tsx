"use client";

import { useActionState } from "react";
import Link from "next/link";
import { SERVICE_CATEGORIES } from "@evzla/core";
import { submitServiceAction, type SubmitServiceState } from "@/lib/actions/servicios";
import { TurnstileField } from "@/components/servicios/turnstile-field";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initialState: SubmitServiceState = { status: "idle" };

const fieldClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3 text-text placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

export function SubmitServiceForm(): React.ReactElement {
  const [state, formAction, pending] = useActionState(submitServiceAction, initialState);

  return (
    <Card>
      <CardBody className="space-y-5">
        <CardTitle>Publicar un servicio gratuito</CardTitle>
        <p className="text-sm text-text-2">
          Ofrece tu ayuda sin costo. Un moderador revisará la publicación antes de mostrarla. Te
          enviaremos un enlace por correo para editarla o darla de baja.
        </p>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="title" className="text-sm font-medium text-text-2">
              Título del servicio
            </label>
            <Input id="title" name="title" required placeholder="Ej. Inspección estructural de edificios" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="category" className="text-sm font-medium text-text-2">
                Categoría
              </label>
              <select id="category" name="category" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  Elige una categoría…
                </option>
                {SERVICE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="contactPhone" className="text-sm font-medium text-text-2">
                Número de contacto (público)
              </label>
              <Input
                id="contactPhone"
                name="contactPhone"
                required
                inputMode="tel"
                placeholder="Ej. +58 412 123 4567"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="text-sm font-medium text-text-2">
              Descripción de lo que haces
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={3}
              className={fieldClass}
              placeholder="Describe el servicio y a quién ayudas…"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="submitterEmail" className="text-sm font-medium text-text-2">
              Tu correo <span className="text-text-3">(privado, no se publica)</span>
            </label>
            <Input
              id="submitterEmail"
              name="submitterEmail"
              type="email"
              required
              autoComplete="email"
              placeholder="Para enviarte el enlace de gestión"
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-text-2">
            <input type="checkbox" name="acceptedTerms" required className="mt-1 h-4 w-4 shrink-0" />
            <span>
              Autorizo publicar de forma pública el servicio, la categoría, la descripción y mi
              número de contacto, y entiendo que cualquier persona podrá verlos y contactarme.
              Declaro que lo ofrezco de forma gratuita y que los datos son veraces. He leído y acepto
              los{" "}
              <Link href="/servicios/terminos" className="text-primary hover:underline">
                Términos de publicación
              </Link>
              .
            </span>
          </label>

          <TurnstileField resetSignal={state} />

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Publicando…" : "Publicar servicio"}
          </Button>

          {state.status === "done" && (
            <p className="rounded-[var(--radius-control)] bg-success/10 px-4 py-3 text-sm text-success" role="status">
              ¡Gracias! Recibimos tu publicación y está en revisión. Revisa tu correo para gestionarla.
            </p>
          )}
          {state.status === "invalid" && (
            <p className="rounded-[var(--radius-control)] bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
              {state.mensaje}
            </p>
          )}
          {state.status === "verification-failed" && (
            <p className="rounded-[var(--radius-control)] bg-warning/10 px-4 py-3 text-sm text-warning" role="alert">
              No pudimos verificar la solicitud. Intenta de nuevo.
            </p>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
