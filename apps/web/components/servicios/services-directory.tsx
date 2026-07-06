"use client";

import { useMemo, useState } from "react";
import type { PublicService } from "@evzla/core";
import { SERVICE_CATEGORIES } from "@evzla/core";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const fieldClass =
  "h-[52px] w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 text-text focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function ServicesDirectory({
  services,
}: {
  services: PublicService[];
}): React.ReactElement {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return services.filter((s) => {
      if (category && s.category !== category) return false;
      if (!nq) return true;
      return (
        norm(s.title).includes(nq) ||
        norm(s.description).includes(nq) ||
        norm(s.category).includes(nq)
      );
    });
  }, [services, q, category]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar servicio, categoría o descripción…"
          aria-label="Buscar servicios"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={fieldClass}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center text-text-2">
            {services.length === 0
              ? "Aún no hay servicios publicados. ¡Sé el primero en ofrecer tu ayuda!"
              : "No hay servicios que coincidan con tu búsqueda."}
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardBody className="flex h-full flex-col gap-3">
                <Badge variant="primary" className="w-fit">
                  {s.category}
                </Badge>
                <h3 className="text-lg font-semibold text-text">{s.title}</h3>
                <p className="flex-1 text-sm text-text-2">{s.description}</p>
                <a
                  href={`tel:${s.contactPhone.replace(/\s+/g, "")}`}
                  className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <span aria-hidden="true">📞</span>
                  {s.contactPhone}
                </a>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
