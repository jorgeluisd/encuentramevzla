import Link from "next/link";
import { createAnonClient } from "@/lib/supabase/anon";

/**
 * `/buscar` — Resultados de la búsqueda mediada.
 *
 * Invoca `public.buscar_paciente(termino)` (SECURITY DEFINER) con la anon key.
 * El RPC devuelve SOLO { hospital_nombre, hospital_telefono_mesa, confianza } o el
 * marcador { requiere_contacto_humano: true } para menores/fallecidos. El cliente
 * anónimo NO puede tocar ninguna tabla: la privacidad la garantiza el motor.
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

interface FilaRpc {
  resultado: {
    termino_invalido?: boolean;
    requiere_contacto_humano?: boolean;
    hospital_nombre?: string;
    hospital_telefono_mesa?: string | null;
    confianza?: number;
  };
}

async function buscar(termino: string): Promise<ResultadoRpc> {
  if (termino.trim().length < 4) return { tipo: "termino_invalido" };

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("buscar_paciente", { termino });
  if (error) {
    // No filtramos detalle al usuario; lo dejamos en logs del servidor.
    console.error("[buscar] error RPC:", error.message);
    return { tipo: "sin_resultados" };
  }

  const objetos = ((data as FilaRpc[] | null) ?? []).map((f) => f.resultado);
  if (objetos.some((o) => o?.termino_invalido)) return { tipo: "termino_invalido" };
  if (objetos.some((o) => o?.requiere_contacto_humano))
    return { tipo: "requiere_contacto_humano" };

  const filas: Coincidencia[] = objetos
    .filter((o) => o && o.hospital_nombre)
    .map((o) => ({
      hospital_nombre: o.hospital_nombre as string,
      hospital_telefono_mesa: o.hospital_telefono_mesa ?? null,
      confianza: Number(o.confianza) || 0,
    }));

  return filas.length ? { tipo: "coincidencias", filas } : { tipo: "sin_resultados" };
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
