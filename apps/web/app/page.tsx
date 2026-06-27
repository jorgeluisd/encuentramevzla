import Image from "next/image";
import { formatLastUpdate } from "@evzla/core";
import { getLastUpdateUseCase } from "@/lib/composition";
import { SearchPanel } from "@/components/search-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";

// Home 100% estático (CDN): se regenera SOLO cuando se sube una lista
// (revalidatePath("/") en la acción de ingesta). Cero invocations en uso normal;
// el sello "última actualización" queda exacto justo cuando cambian los datos.
export const dynamic = "force-static";

// Lee la última actualización tolerando que la BD no esté disponible (p. ej. en build):
// si falla, el badge cae a su texto base en vez de romper el render.
async function lastUpdate(): Promise<Date | null> {
  try {
    return await getLastUpdateUseCase().execute();
  } catch {
    return null;
  }
}

// 3 tarjetas "cómo funciona" (specs/0004 A1). Datos estáticos de presentación.
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

/**
 * `/` — Buscador público (concepto A1). Tres campos que se combinan en el RPC
 * `public.search_patient` vía el caso de uso SearchPatients. Privacidad mediada.
 */
export default async function HomePage(): Promise<React.ReactElement> {
  const lastUpdateAt = await lastUpdate();

  return (
    <div className="space-y-10">
      <section className="space-y-5 text-center">
        <Image
          src="/brand/logo-encuentramevzla.svg"
          alt="EncuéntrameVzla"
          width={280}
          height={158}
          priority
          className="mx-auto h-auto w-44 sm:w-56"
        />
        <div className="flex justify-center">
          <Badge variant="success">{formatLastUpdate(lastUpdateAt)}</Badge>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            Encuentra a tu familiar
          </h1>
          <p className="mx-auto max-w-xl text-text-2">
            Busca a una persona ingresada en un hospital tras el sismo. Es privado y
            seguro.
          </p>
        </div>
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
            <p className="text-sm text-text-2">
              La Cruz Roja también te ayuda a buscar.
            </p>
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
  );
}
