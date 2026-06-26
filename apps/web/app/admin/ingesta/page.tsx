"use client";

import { useActionState } from "react";
import { subirExcelAction, type EstadoIngesta } from "@/lib/actions/ingesta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

const INICIAL: EstadoIngesta = { ok: false };

/**
 * `/admin/ingesta` — Subir el Excel hospitalario y ver el resumen del procesamiento.
 *
 * STUB de protección: en producción exige sesión + rol uploader/moderador
 * (tarea de auth pendiente). Por ahora la ruta es abierta.
 */
export default function AdminIngestaPage(): React.ReactElement {
  const [estado, formAction, pending] = useActionState(subirExcelAction, INICIAL);

  return (
    <div className="space-y-6">
      <Card className="border-warning/30 bg-warning/5">
        <CardBody className="text-sm text-warning">
          Área restringida (placeholder). En producción requiere autenticación de
          uploader/moderador.
        </CardBody>
      </Card>

      <header className="space-y-2">
        <h1 className="text-xl font-semibold sm:text-2xl">
          Portal de carga de listas
        </h1>
        <p className="text-text-2">
          Sube el archivo .xlsx provisto por el hospital. Cada lista pasa por
          deduplicación y validación humana; los datos sensibles van a un esquema
          aislado.
        </p>
      </header>

      <Card>
        <CardBody>
          <form action={formAction} className="space-y-4">
            <input
              type="file"
              name="archivo"
              accept=".xlsx,.xls"
              required
              className="block w-full rounded-[var(--radius-control)] border border-border bg-surface p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:font-medium file:text-white"
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Procesando…" : "Subir y procesar"}
            </Button>
          </form>
        </CardBody>
      </Card>

      {estado.mensaje && !estado.ok && (
        <Card className="border-danger/30 bg-danger/5">
          <CardBody className="text-sm text-danger">{estado.mensaje}</CardBody>
        </Card>
      )}

      {estado.ok && estado.resumen && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-text">
                Resumen — hoja{" "}
                <span className="font-mono text-text-2">{estado.resumen.sheet}</span>
              </h2>
              <Badge variant="success">Procesado</Badge>
            </div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Dato k="Filas leídas" v={estado.resumen.rowsRead} />
              <Dato k="Filas únicas" v={estado.resumen.uniqueRows} />
              <Dato k="Staging nuevas" v={estado.resumen.newRows} />
              <Dato k="Ya existían (idempotencia)" v={estado.resumen.alreadyPresent} />
              <Dato k="Hospitales" v={estado.resumen.hospitals} />
              <Dato k="Personas nuevas" v={estado.resumen.newPatients} />
              <Dato k="Personas fusionadas" v={estado.resumen.mergedPatients} />
              <Dato k="Conflictos de cédula" v={estado.resumen.documentConflicts} />
              <Dato k="Zona gris (a revisión)" v={estado.resumen.pendingReview} />
              <Dato k="Ingresos nuevos" v={estado.resumen.newAdmissions} />
              <Dato k="Menores (a contacto humano)" v={estado.resumen.minors} />
              <Dato k="Fallecidos detectados" v={estado.resumen.deceased} />
            </ul>
            <p className="text-xs text-text-3">
              Los conflictos de cédula y la zona gris quedan en el audit log para
              revisión humana (la residente decide la fusión).
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Dato({ k, v }: { k: string; v: number }): React.ReactElement {
  return (
    <li className="flex justify-between border-b border-border py-1">
      <span className="text-text-2">{k}</span>
      <span className="font-semibold tabular-nums text-text">{v}</span>
    </li>
  );
}
