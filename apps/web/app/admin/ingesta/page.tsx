"use client";

import { useActionState } from "react";
import { subirExcelAction, type EstadoIngesta } from "@/lib/actions/ingesta";

const INICIAL: EstadoIngesta = { ok: false };

/**
 * `/admin/ingesta` — Subir el Excel hospitalario y ver el resumen del procesamiento.
 *
 * STUB de protección: en producción exige sesión + rol uploader/moderador
 * (middleware / verificación server-side). Por ahora la ruta es abierta.
 */
export default function AdminIngestaPage(): React.ReactElement {
  const [estado, formAction, pending] = useActionState(subirExcelAction, INICIAL);

  return (
    <section className="space-y-6 py-6">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        Área restringida (placeholder). En producción requiere autenticación de
        uploader/moderador.
      </div>

      <h1 className="text-xl font-bold">Ingesta de Excel hospitalario</h1>
      <p className="text-gray-600">
        Sube el archivo .xlsx provisto por el hospital. Las filas se preservan tal cual
        (dato crudo), se deduplican y los datos sensibles van a un esquema aislado.
      </p>

      <form action={formAction} className="space-y-3">
        <input
          type="file"
          name="archivo"
          accept=".xlsx,.xls"
          required
          className="block w-full text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-teal-700 px-4 py-2 font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {pending ? "Procesando…" : "Subir y procesar"}
        </button>
      </form>

      {estado.mensaje && !estado.ok && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {estado.mensaje}
        </p>
      )}

      {estado.ok && estado.resumen && (
        <div className="space-y-3 rounded-md border border-gray-200 p-4">
          <h2 className="font-semibold">
            Resumen — hoja <span className="font-mono">{estado.resumen.hoja}</span>
          </h2>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <Dato k="Filas leídas" v={estado.resumen.filasLeidas} />
            <Dato k="Filas únicas" v={estado.resumen.filasUnicas} />
            <Dato k="Staging nuevas" v={estado.resumen.stagingNuevas} />
            <Dato k="Ya existían (idempotencia)" v={estado.resumen.stagingYaExistian} />
            <Dato k="Hospitales" v={estado.resumen.hospitales} />
            <Dato k="Personas nuevas" v={estado.resumen.personasNuevas} />
            <Dato k="Personas fusionadas" v={estado.resumen.personasFusionadas} />
            <Dato k="Conflictos de cédula" v={estado.resumen.conflictosCedula} />
            <Dato k="Zona gris (a revisión)" v={estado.resumen.zonaGris} />
            <Dato k="Ingresos nuevos" v={estado.resumen.ingresosNuevos} />
            <Dato k="Menores (a contacto humano)" v={estado.resumen.menores} />
            <Dato k="Fallecidos detectados" v={estado.resumen.fallecidos} />
          </ul>
          <p className="text-xs text-gray-500">
            Los conflictos de cédula y la zona gris quedan en el audit log para revisión
            humana (la residente decide la fusión).
          </p>
        </div>
      )}
    </section>
  );
}

function Dato({ k, v }: { k: string; v: number }): React.ReactElement {
  return (
    <li className="flex justify-between border-b border-gray-100 py-0.5">
      <span className="text-gray-600">{k}</span>
      <span className="font-semibold tabular-nums">{v}</span>
    </li>
  );
}
