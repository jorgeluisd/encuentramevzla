import Link from "next/link";
import { searchPatientsUseCase } from "@/lib/composition";

/**
 * `/buscar` — Resultados de la búsqueda mediada.
 *
 * Delega en el caso de uso SearchPatients (composition root), que invoca el RPC
 * SECURITY DEFINER. Devuelve solo hospital + mesa de información, o el marcador de
 * contacto humano para menores/fallecidos. El cliente anónimo no toca ninguna tabla.
 */
export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ termino?: string }>;
}): Promise<React.ReactElement> {
  const { termino = "" } = await searchParams;
  const result = await searchPatientsUseCase().execute(termino);

  return (
    <section className="space-y-6 py-6">
      <h1 className="text-xl font-bold">Resultados</h1>
      <p className="text-sm text-gray-500">
        Búsqueda: <span className="font-mono">{termino || "—"}</span>
      </p>

      {result.kind === "invalid-term" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Escribe al menos 4 caracteres para buscar.
        </p>
      )}

      {result.kind === "no-results" && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-gray-700">
          No encontramos coincidencias con ese nombre. Verifica la escritura o intenta
          con el apellido.
        </p>
      )}

      {result.kind === "human-contact" && (
        <div className="rounded-md border border-teal-200 bg-teal-50 p-4 text-teal-900">
          <p className="font-semibold">Necesitamos hablar contigo en persona.</p>
          <p>
            Para este caso no podemos dar información automatizada. Por favor, comunícate
            con la mesa de atención humanitaria para recibir acompañamiento.
          </p>
        </div>
      )}

      {result.kind === "matches" && (
        <ul className="space-y-3">
          {result.matches.map((match, i) => (
            <li key={i} className="rounded-md border border-gray-200 p-4">
              <p>
                Hay una coincidencia en el{" "}
                <strong>Hospital {match.hospitalName}</strong>.
              </p>
              <p className="text-sm text-gray-700">
                Mesa de información:{" "}
                <strong>{match.infoDeskPhone ?? "(consulta en el hospital)"}</strong>
              </p>
            </li>
          ))}
        </ul>
      )}

      <Link href="/" className="text-sm text-teal-700 underline">
        ← Nueva búsqueda
      </Link>
    </section>
  );
}
