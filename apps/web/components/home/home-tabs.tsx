"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicService } from "@evzla/core";
import { ListPublishedServices } from "@evzla/core";
import { createAnonClient } from "@/lib/supabase/anon";
import { SupabaseSolidarityServiceDirectory } from "@/lib/infrastructure/solidarity-services/supabase-solidarity-service-directory";
import { SearchPanel } from "@/components/search-panel";
import { ServicesDirectory } from "@/components/servicios/services-directory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";

type Tab = "buscar" | "servicios";

const HOW_IT_WORKS = [
  {
    title: "Listas unidas",
    body: "Reunimos las listas de varios hospitales en un solo lugar para que no tengas que llamar a cada uno.",
  },
  {
    title: "Datos cuidados",
    body: "No mostramos diagnóstico, edad ni dirección. Solo el hospital donde preguntar.",
  },
  {
    title: "Dónde acudir",
    body: "Te indicamos en qué hospital hay una coincidencia para que vayas directamente. Para emergencias, marca las líneas oficiales del aviso de arriba.",
  },
] as const;

function TabIcon({ tab }: { tab: Tab }): React.ReactElement {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (tab === "buscar") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

export function HomeTabs({ lastUpdateLabel }: { lastUpdateLabel: string }): React.ReactElement {
  const [tab, setTab] = useState<Tab>("buscar");

  // Servicios: se cargan del lado del cliente al abrir la pestaña (el home sigue estático).
  const [services, setServices] = useState<PublicService[] | null>(null);
  const [servicesError, setServicesError] = useState(false);

  useEffect(() => {
    if (tab !== "servicios" || services !== null) return;
    let cancelled = false;
    const directory = new SupabaseSolidarityServiceDirectory(createAnonClient());
    new ListPublishedServices(directory)
      .execute()
      .then((rows) => {
        if (!cancelled) setServices(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setServices([]);
          setServicesError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tab, services]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "buscar", label: "Buscar familiar" },
    { key: "servicios", label: "Servicios" },
  ];

  return (
    <div className="space-y-8">
      {/* Control segmentado */}
      <div
        role="tablist"
        aria-label="Secciones"
        className="mx-auto grid w-full max-w-md grid-cols-2 gap-1 rounded-full border border-border bg-surface p-1"
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-bg text-primary shadow-[var(--shadow-card)]"
                  : "text-text-2 hover:text-text"
              }`}
            >
              <TabIcon tab={t.key} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "buscar" ? (
        <div className="space-y-10">
          <section className="space-y-3 text-center">
            <div className="flex justify-center">
              <Badge variant="success">{lastUpdateLabel}</Badge>
            </div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Encuentra a tu familiar</h1>
            <p className="mx-auto max-w-xl text-text-2">
              Busca a una persona ingresada en un hospital tras el sismo. Es privado y seguro.
            </p>
          </section>

          <SearchPanel />

          <section className="space-y-4">
            <h2 className="text-center text-lg font-semibold">¿Cómo funciona?</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {HOW_IT_WORKS.map((item) => (
                <Card key={item.title}>
                  <CardBody className="space-y-2">
                    <CardTitle>{item.title}</CardTitle>
                    <p className="text-sm text-text-2">{item.body}</p>
                  </CardBody>
                </Card>
              ))}
            </div>
          </section>

          <Card className="border-danger/20 bg-danger/5">
            <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-text">¿No encuentras a tu familiar?</p>
                <p className="text-sm text-text-2">La Cruz Roja también te ayuda a buscar.</p>
                <p className="mt-1 text-xs text-text-3">
                  Av. Andrés Bello, Edificio Cruz Roja Venezolana, Caracas.
                </p>
              </div>
              <a href="tel:+582125714380" className="shrink-0">
                <Button variant="danger" className="w-full sm:w-auto">
                  Llamar a la Cruz Roja
                </Button>
              </a>
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3 text-center">
            <h1 className="text-2xl font-semibold sm:text-3xl">Ayuda gratuita tras el sismo</h1>
            <p className="mx-auto max-w-2xl text-text-2">
              Servicios solidarios de personas que ofrecen su tiempo y conocimiento sin costo:
              inspección de edificios, atención médica, apoyo legal, alimentación y mucho más.
            </p>
            <div className="flex justify-center">
              <Link href="/servicios">
                <Button>Publicar un servicio gratuito</Button>
              </Link>
            </div>
          </section>

          {services === null ? (
            <Card>
              <CardBody className="py-10 text-center text-text-2">Cargando servicios…</CardBody>
            </Card>
          ) : servicesError ? (
            <Card>
              <CardBody className="py-10 text-center text-text-2">
                No pudimos cargar los servicios. Intenta de nuevo más tarde.
              </CardBody>
            </Card>
          ) : (
            <ServicesDirectory services={services} />
          )}
        </div>
      )}
    </div>
  );
}
