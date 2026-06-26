"use client";

import { useState } from "react";
import {
  ingestionDisplayStatus,
  type IngestionSummary,
} from "@evzla/core";
import { subirExcelAction } from "@/lib/actions/ingesta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

// Fila de la tabla "Cargas recientes". Estado de sesión: arranca vacía y se llena
// con cada carga (no se persiste; la tabla histórica del equipo llegará con auth + DB).
interface UploadRow {
  fileName: string;
  uploadedBy: string;
  records: number;
  at: Date;
  status: "published" | "review" | "invalid";
  reviewCount: number;
}

/**
 * `/admin/ingesta` — Portal de carga de listas.
 *
 * STUB de protección: en producción exige sesión + rol uploader/moderador
 * (tarea de auth pendiente). Por ahora la ruta es abierta y "Subido por" va vacío.
 */
export default function AdminIngestaPage(): React.ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<IngestionSummary | null>(null);
  const [rows, setRows] = useState<UploadRow[]>([]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const file = formData.get("archivo");
    const fileName = file instanceof File ? file.name : "—";

    setPending(true);
    setError(null);
    const result = await subirExcelAction({ ok: false }, formData);
    setPending(false);

    if (result.ok && result.resumen) {
      const summary = result.resumen;
      setLastSummary(summary);
      setRows((prev) => [
        {
          fileName,
          uploadedBy: "—",
          records: summary.rowsRead,
          at: new Date(),
          status: ingestionDisplayStatus(summary),
          reviewCount: summary.documentConflicts + summary.pendingReview,
        },
        ...prev,
      ]);
      form.reset();
    } else {
      setError(result.mensaje ?? "Error procesando el archivo.");
      setRows((prev) => [
        {
          fileName,
          uploadedBy: "—",
          records: 0,
          at: new Date(),
          status: "invalid",
          reviewCount: 0,
        },
        ...prev,
      ]);
    }
  }

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
          <form onSubmit={onSubmit} className="space-y-4">
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

      {error && (
        <Card className="border-danger/30 bg-danger/5">
          <CardBody className="text-sm text-danger">{error}</CardBody>
        </Card>
      )}

      <RecentUploads rows={rows} />

      {lastSummary && (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-text">
                Resumen — hoja{" "}
                <span className="font-mono text-text-2">{lastSummary.sheet}</span>
              </h2>
              <StatusBadge
                status={ingestionDisplayStatus(lastSummary)}
                count={lastSummary.documentConflicts + lastSummary.pendingReview}
              />
            </div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <Dato k="Filas leídas" v={lastSummary.rowsRead} />
              <Dato k="Filas únicas" v={lastSummary.uniqueRows} />
              <Dato k="Staging nuevas" v={lastSummary.newRows} />
              <Dato k="Ya existían (idempotencia)" v={lastSummary.alreadyPresent} />
              <Dato k="Hospitales" v={lastSummary.hospitals} />
              <Dato k="Personas nuevas" v={lastSummary.newPatients} />
              <Dato k="Personas fusionadas" v={lastSummary.mergedPatients} />
              <Dato k="Conflictos de cédula" v={lastSummary.documentConflicts} />
              <Dato k="Zona gris (a revisión)" v={lastSummary.pendingReview} />
              <Dato k="Ingresos nuevos" v={lastSummary.newAdmissions} />
              <Dato k="Menores (a contacto humano)" v={lastSummary.minors} />
              <Dato k="Fallecidos detectados" v={lastSummary.deceased} />
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

// Tabla "Cargas recientes" (concepto B2). Scroll horizontal en móvil; vacía hasta la 1ª carga.
function RecentUploads({ rows }: { rows: UploadRow[] }): React.ReactElement {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="font-semibold text-text">Cargas recientes</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-text-3">
            Aún no has subido ninguna lista en esta sesión.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-text-3">
                <tr className="border-b border-border">
                  <th className="py-2 pr-4 font-medium">Archivo</th>
                  <th className="py-2 pr-4 font-medium">Subido por</th>
                  <th className="py-2 pr-4 font-medium">Registros</th>
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-text">
                      {row.fileName}
                    </td>
                    <td className="py-2 pr-4 text-text-2">{row.uploadedBy}</td>
                    <td className="py-2 pr-4 tabular-nums text-text-2">
                      {row.records}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap text-text-2">
                      {row.at.toLocaleString("es-VE", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2">
                      <StatusBadge status={row.status} count={row.reviewCount} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function StatusBadge({
  status,
  count,
}: {
  status: "published" | "review" | "invalid";
  count: number;
}): React.ReactElement {
  if (status === "invalid")
    return <Badge variant="danger">Formato inválido</Badge>;
  if (status === "review")
    return (
      <Badge variant="warning">
        En revisión{count > 0 ? ` (${count})` : ""}
      </Badge>
    );
  return <Badge variant="success">Publicada</Badge>;
}

function Dato({ k, v }: { k: string; v: number }): React.ReactElement {
  return (
    <li className="flex justify-between border-b border-border py-1">
      <span className="text-text-2">{k}</span>
      <span className="font-semibold tabular-nums text-text">{v}</span>
    </li>
  );
}
