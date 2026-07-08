"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicService } from "@evzla/core";
import { SERVICE_CATEGORIES } from "@evzla/core";
import { ReportServiceButton } from "@/components/servicios/report-service-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const PAGE_SIZE = 9;

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
  const [visible, setVisible] = useState(PAGE_SIZE);

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

  // Al cambiar el filtro, se reinicia la paginación al primer bloque.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [q, category]);

  const shown = filtered.slice(0, visible);
  const hasMore = visible < filtered.length;

  // Scroll infinito: al entrar el centinela en viewport, se revela otro bloque.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible((v) => v + PAGE_SIZE);
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, shown.length]);

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
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {shown.map((s) => (
              <Card key={s.id}>
                <CardBody className="flex h-full flex-col gap-3">
                  <Badge variant="primary" className="w-fit">
                    {s.category}
                  </Badge>
                  <h3 className="text-lg font-semibold text-text">{s.title}</h3>
                  <p className="flex-1 text-sm text-text-2">{s.description}</p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <a
                      href={`tel:${s.contactPhone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    >
                      <span aria-hidden="true">📞</span>
                      {s.contactPhone}
                    </a>
                    <ReportServiceButton serviceId={s.id} />
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>

          {hasMore && (
            <div ref={sentinelRef} className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Cargar más
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-text-3" aria-live="polite">
            Mostrando {shown.length} de {filtered.length}
          </p>
        </>
      )}
    </div>
  );
}
