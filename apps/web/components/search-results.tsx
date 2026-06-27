import { displayName, type MediatedMatch, type MediatedSearchResult } from "@evzla/core";
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
 * Resultados de la búsqueda mediada (concepto A2/A3). Renderiza cada variante del
 * contrato: término inválido, sin resultados, límite de frecuencia y coincidencias
 * agrupadas por hospital. No muestra diagnóstico, edad ni dirección.
 */
export function SearchResults({
  result,
}: {
  result: MediatedSearchResult;
}): React.ReactElement {
  if (result.kind === "invalid-term") {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="text-warning" role="status" aria-live="polite">
          Escribe al menos 4 caracteres (nombre, apellido o cédula) para buscar.
        </CardBody>
      </Card>
    );
  }

  if (result.kind === "rate-limited") {
    return (
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="space-y-2" role="status" aria-live="polite">
          <h2 className="text-lg font-semibold text-text">Demasiadas búsquedas seguidas</h2>
          <p className="text-text-2">
            Para proteger la información, limitamos cuántas búsquedas se hacen en pocos
            minutos. Espera un momento y vuelve a intentarlo.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (result.kind === "no-results") {
    return (
      <Card>
        <CardBody className="space-y-3" role="status" aria-live="polite">
          <h2 className="text-xl font-semibold text-text sm:text-2xl">
            Todavía no encontramos esa información
          </h2>
          <p className="text-text-2">
            Aún no tenemos coincidencias con ese dato en el sistema. Que no aparezca no
            significa una mala noticia; puede que su nombre todavía no haya sido
            ingresado. Vuelve a consultar más tarde.
          </p>
          <p className="font-semibold text-text">No pierdas la esperanza.</p>
          <div className="rounded-[var(--radius-control)] bg-surface p-4 text-sm">
            <p className="font-medium text-text">
              ¿No encuentras a tu familiar? La Cruz Roja también te ayuda a buscar.
            </p>
            <p className="mt-1">
              <a href="tel:+582125714380" className="font-semibold text-danger underline">
                +58 212-571-4380
              </a>
            </p>
            <p className="text-text-3">
              Av. Andrés Bello, Edificio Cruz Roja Venezolana, Caracas.
            </p>
          </div>
        </CardBody>
      </Card>
    );
  }

  // result.kind === "matches"
  const groups = groupByHospital(result.matches);
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <Badge variant="success">
        {result.matches.length === 1
          ? "1 coincidencia"
          : `${groups.length} hospitales con coincidencias`}
      </Badge>

      {groups.map((group, i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <div>
              <p className="text-sm text-text-3">Institución hospitalaria</p>
              <p className="text-lg font-semibold text-text">{group.hospitalName}</p>
            </div>

            <ul className="space-y-1">
              {group.names.map((name, j) => (
                <li key={j} className="font-medium text-text">
                  {name}
                </li>
              ))}
            </ul>

            <p className="text-sm text-text-2">
              No mostramos diagnóstico, edad ni dirección. La mesa de información del
              hospital te dirá qué hacer.
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
  );
}
