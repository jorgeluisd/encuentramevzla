import Link from "next/link";
import { displayName, type MediatedMatch } from "@evzla/core";
import { searchPatientsUseCase } from "@/lib/composition";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

// Agrupa las coincidencias por hospital (dedupe de nombres dentro del mismo hospital).
interface HospitalGroup {
  hospitalName: string;
  infoDeskPhone: string | null;
  names: string[];
}

function groupByHospital(matches: readonly MediatedMatch[]): HospitalGroup[] {
  const groups = new Map<string, HospitalGroup>();
  for (const match of matches) {
    const group = groups.get(match.hospitalName) ?? {
      hospitalName: match.hospitalName,
      infoDeskPhone: match.infoDeskPhone,
      names: [],
    };
    const name = displayName(match.patientName);
    if (name && !group.names.includes(name)) group.names.push(name);
    groups.set(match.hospitalName, group);
  }
  return [...groups.values()];
}

/**
 * `/buscar` — Resultados (concepto A2/A3). Delega en SearchPatients (RPC
 * SECURITY DEFINER). Adultos vivos -> nombre(s) + hospital + mesa de información,
 * agrupados por hospital. Menores/fallecidos -> contacto humano. El cliente anónimo
 * no toca ninguna tabla.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ termino?: string }>;
}): Promise<React.ReactElement> {
  const { termino = "" } = await searchParams;
  const result = await searchPatientsUseCase().execute(termino);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold sm:text-2xl">
          Resultados {termino && <span className="text-text-2">para “{termino}”</span>}
        </h1>
        <Link
          href="/"
          className="shrink-0 text-sm font-medium text-primary hover:underline"
        >
          ← Nueva búsqueda
        </Link>
      </div>

      {result.kind === "invalid-term" && (
        <Card className="border-warning/30 bg-warning/5">
          <CardBody className="text-warning">
            Escribe al menos 4 caracteres (nombre, apellido o cédula) para buscar.
          </CardBody>
        </Card>
      )}

      {result.kind === "no-results" && (
        <Card>
          <CardBody className="space-y-3">
            <p className="font-semibold text-text">No pierdas la esperanza.</p>
            <p className="text-text-2">
              Aún no tenemos información con ese dato en el sistema. Que no aparezca no
              significa una mala noticia; puede que su nombre todavía no haya sido
              ingresado. Vuelve a consultar más tarde.
            </p>
            <div className="rounded-[var(--radius-control)] bg-surface p-4 text-sm">
              <p className="font-medium text-text">
                ¿No encuentras a tu familiar? La Cruz Roja también te ayuda a buscar.
              </p>
              <p className="mt-1">
                <a
                  href="tel:+582125714380"
                  className="font-semibold text-danger underline"
                >
                  +58 212-571-4380
                </a>
              </p>
              <p className="text-text-3">
                Av. Andrés Bello, Edificio Cruz Roja Venezolana, Caracas.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {result.kind === "human-contact" && (
        <Card className="border-primary/20 bg-primary/5">
          <CardBody className="space-y-2">
            <p className="font-semibold text-primary">
              Necesitamos hablar contigo en persona.
            </p>
            <p className="text-text-2">
              Para este caso no podemos dar información automatizada. Comunícate con la
              mesa de atención humanitaria para recibir acompañamiento.
            </p>
            <p className="text-sm text-text-3">
              Las noticias delicadas siempre las da una persona, nunca la app.
            </p>
          </CardBody>
        </Card>
      )}

      {result.kind === "matches" && (
        <div className="space-y-4">
          <Badge variant="success">
            {result.matches.length === 1
              ? "1 coincidencia"
              : `${groupByHospital(result.matches).length} hospitales con coincidencias`}
          </Badge>

          {groupByHospital(result.matches).map((group, i) => (
            <Card key={i}>
              <CardBody className="space-y-3">
                <div>
                  <p className="text-sm text-text-3">Institución hospitalaria</p>
                  <p className="text-lg font-semibold text-text">
                    {group.hospitalName}
                  </p>
                </div>

                <ul className="space-y-1">
                  {group.names.map((name, j) => (
                    <li key={j} className="font-medium text-text">
                      {name}
                    </li>
                  ))}
                </ul>

                <p className="text-sm text-text-2">
                  No mostramos diagnóstico, edad ni dirección. La mesa de información
                  del hospital te dirá qué hacer.
                </p>

                <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-2">
                    Mesa de información:{" "}
                    <strong className="text-text">
                      {group.infoDeskPhone ?? "(consulta en el hospital)"}
                    </strong>
                  </p>
                  {group.infoDeskPhone && (
                    <a href={`tel:${group.infoDeskPhone}`}>
                      <Button variant="danger" className="w-full sm:w-auto">
                        Llamar
                      </Button>
                    </a>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
