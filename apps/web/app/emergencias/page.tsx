import type { Metadata } from "next";
import { telHref } from "@evzla/core";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { EMERGENCY_GROUPS } from "./contacts";

export const metadata: Metadata = {
  title: "Números de emergencia — EncuéntrameVzla",
  description:
    "Teléfonos oficiales de emergencia en Venezuela: protección civil, bomberos, policía y sismos. Información pública.",
};

/**
 * `/emergencias` — Página pública con los teléfonos oficiales de emergencia
 * (specs/0011). Información estática; sin auth ni datos sensibles.
 */
export default function EmergenciasPage(): React.ReactElement {
  return (
    <div className="space-y-8">
      <section className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Números de emergencia</h1>
        <p className="mx-auto max-w-xl text-text-2">
          Teléfonos oficiales en Venezuela. Toca un número para llamar.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {EMERGENCY_GROUPS.map((group) => (
          <Card key={group.title}>
            <CardBody className="space-y-4">
              <div className="space-y-1">
                <CardTitle>{group.title}</CardTitle>
                {group.note && (
                  <p className="text-sm text-text-2">{group.note}</p>
                )}
              </div>

              {group.phones && (
                <ul className="space-y-3">
                  {group.phones.map((contact) => (
                    <li
                      key={contact.label}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="text-sm text-text">{contact.label}</span>
                      <span className="flex flex-wrap gap-2">
                        {contact.phones.map((phone) => (
                          <a
                            key={phone}
                            href={telHref(phone)}
                            className="inline-flex min-h-[44px] items-center rounded-[var(--radius-card)] border border-primary/30 bg-primary/5 px-3 font-semibold text-primary hover:bg-primary/10"
                          >
                            {phone}
                          </a>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {group.info && (
                <ul className="space-y-2 border-t border-border pt-3">
                  {group.info.map((item) => (
                    <li key={item.label}>
                      <p className="text-sm font-semibold text-text">{item.label}</p>
                      <p className="text-sm text-text-2">{item.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <p className="text-center text-xs text-text-3">
        Información pública de referencia. No es un servicio oficial de rescate.
      </p>
    </div>
  );
}
