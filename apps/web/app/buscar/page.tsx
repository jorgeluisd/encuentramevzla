import Link from "next/link";

/**
 * `/buscar` — Resultados de la búsqueda mediada.
 *
 * STUB: el copy es real, la llamada al RPC está esbozada pero comentada.
 * Cuando se conecte, invocará `public.buscar_paciente(termino)` (SECURITY DEFINER),
 * que devuelve SOLO { hospital_nombre, hospital_telefono_mesa, confianza } o el
 * marcador { requiere_contacto_humano: true } para menores/fallecidos.
 */

interface Coincidencia {
  hospital_nombre: string;
  hospital_telefono_mesa: string | null;
  confianza: number;
}

type ResultadoRpc =
  | { tipo: "coincidencias"; filas: Coincidencia[] }
  | { tipo: "requiere_contacto_humano" }
  | { tipo: "sin_resultados" }
  | { tipo: "termino_invalido" };

async function buscar(termino: string): Promise<ResultadoRpc> {
  // TODO: conectar con Supabase y llamar al RPC mediado.
  // const supabase = createBrowserClient();
  // const { data, error } = await supabase.rpc("buscar_paciente", { termino });
  // ...mapear `data` a ResultadoRpc...
  if (termino.trim().length < 4) return { tipo: "termino_invalido" };
  return { tipo: "sin_resultados" };
}

export default async function BuscarPage({
  searchParams,
}: {
  searchParams: Promise<{ termino?: string }>;
}): Promise<React.ReactElement> {
  const { termino = "" } = await searchParams;
  const resultado = await buscar(termino);

  return (
    <section className="space-y-6 py-6">
      <h1 className="text-xl font-bold">Resultados</h1>
      <p className="text-sm text-gray-500">
        Búsqueda: <span className="font-mono">{termino || "—"}</span>
      </p>

      {resultado.tipo === "termino_invalido" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800">
          Escribe al menos 4 caracteres para buscar.
        </p>
      )}

      {resultado.tipo === "sin_resultados" && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-4 text-gray-700">
          No encontramos coincidencias con ese nombre. Verifica la escritura o intenta
          con el apellido.
        </p>
      )}

      {resultado.tipo === "requiere_contacto_humano" && (
        <div className="rounded-md border border-teal-200 bg-teal-50 p-4 text-teal-900">
          <p className="font-semibold">Necesitamos hablar contigo en persona.</p>
          <p>
            Para este caso no podemos dar información automatizada. Por favor, comunícate
            con la mesa de atención humanitaria para recibir acompañamiento.
          </p>
        </div>
      )}

      {resultado.tipo === "coincidencias" && (
        <ul className="space-y-3">
          {resultado.filas.map((c, i) => (
            <li key={i} className="rounded-md border border-gray-200 p-4">
              <p>
                Hay una coincidencia en el{" "}
                <strong>Hospital {c.hospital_nombre}</strong>.
              </p>
              <p className="text-sm text-gray-700">
                Mesa de información:{" "}
                <strong>{c.hospital_telefono_mesa ?? "(consulta en el hospital)"}</strong>
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
