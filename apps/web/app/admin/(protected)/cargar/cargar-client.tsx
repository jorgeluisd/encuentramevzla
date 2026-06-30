"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { HospitalPatientListItem, PatientStatus } from "@evzla/core";
import {
  cargarPacienteManualAction,
  dictarPacienteAction,
  editarPacienteAction,
} from "@/lib/actions/voz";
import { subirExcelAction } from "@/lib/actions/ingesta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface HospitalRef {
  id: string;
  name: string;
}

interface Props {
  isScoped: boolean;
  hospitals: HospitalRef[];
  activeHospitalId: string | null;
  activeHospitalName: string | null;
  items: HospitalPatientListItem[];
}

const STATUS_LABELS: Record<PatientStatus, string> = {
  admitted: "Ingresado",
  transferred: "Trasladado",
  discharged: "De alta",
  located: "Localizado",
  deceased: "Fallecido",
};

const STATUS_ORDER: PatientStatus[] = [
  "admitted",
  "transferred",
  "discharged",
  "located",
  "deceased",
];

// Campos del panel compartido (dictado / manual / edición).
interface PanelFields {
  fullName: string;
  documentNumber: string;
  age: string;
  phone: string;
  address: string;
  clinicalNotes: string;
  status: PatientStatus;
  deceased: boolean;
}

const emptyFields = (): PanelFields => ({
  fullName: "",
  documentNumber: "",
  age: "",
  phone: "",
  address: "",
  clinicalNotes: "",
  status: "admitted",
  deceased: false,
});

type PanelMode =
  | { kind: "closed" }
  | { kind: "create"; transcript: string | null; fields: PanelFields }
  | { kind: "edit"; patientId: string; fields: PanelFields };

const fieldClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3 text-text " +
  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

export function CargarClient({
  isScoped,
  hospitals,
  activeHospitalId,
  activeHospitalName,
  items,
}: Props): React.ReactElement {
  const router = useRouter();
  const [panel, setPanel] = useState<PanelMode>({ kind: "closed" });
  const [recording, setRecording] = useState(false);
  const [dictando, setDictando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const sinHospital = activeHospitalId === null;

  // --- Grabación por voz (MediaRecorder). El audio NO se persiste; se manda a STT y se descarta.
  async function iniciarGrabacion(): Promise<void> {
    setAviso(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        await procesarAudio(blob);
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      setAviso({ tipo: "error", texto: "No se pudo acceder al micrófono." });
    }
  }

  function detenerGrabacion(): void {
    mediaRef.current?.stop();
    setRecording(false);
  }

  async function procesarAudio(blob: Blob): Promise<void> {
    setDictando(true);
    setAviso(null);
    try {
      const fd = new FormData();
      fd.append("audio", blob, "dictado.webm");
      const res = await dictarPacienteAction(fd);
      if (!res.ok || !res.borrador) {
        setAviso({ tipo: "error", texto: res.mensaje ?? "No se pudo procesar el dictado." });
        return;
      }
      const b = res.borrador;
      setPanel({
        kind: "create",
        transcript: res.transcript ?? null,
        fields: {
          fullName: b.fullName ?? "",
          documentNumber: b.documentNumber ?? "",
          age: b.age != null ? String(b.age) : "",
          phone: b.phone ?? "",
          address: b.address ?? "",
          clinicalNotes: b.clinicalNotes ?? "",
          status: b.deceased ? "deceased" : "admitted",
          deceased: b.deceased,
        },
      });
    } finally {
      setDictando(false);
    }
  }

  function abrirManual(): void {
    setAviso(null);
    setPanel({ kind: "create", transcript: null, fields: emptyFields() });
  }

  function abrirEdicion(item: HospitalPatientListItem): void {
    setAviso(null);
    setPanel({
      kind: "edit",
      patientId: item.patientId,
      fields: {
        fullName: item.fullName ?? "",
        documentNumber: item.documentNumber ?? "",
        age: item.age != null ? String(item.age) : "",
        phone: item.phone ?? "",
        address: item.address ?? "",
        clinicalNotes: item.clinicalNotes ?? "",
        status: item.status,
        deceased: item.status === "deceased",
      },
    });
  }

  async function guardarPanel(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (panel.kind === "closed") return;
    const fd = new FormData(e.currentTarget);

    setGuardando(true);
    setAviso(null);
    try {
      if (panel.kind === "edit") {
        fd.set("patientId", panel.patientId);
        const res = await editarPacienteAction({ ok: false }, fd);
        if (!res.ok) {
          setAviso({ tipo: "error", texto: res.mensaje ?? "No se pudo editar." });
          return;
        }
        setAviso({ tipo: "ok", texto: "Cambios guardados." });
      } else {
        if (activeHospitalId) fd.set("hospitalId", activeHospitalId);
        if (panel.transcript) fd.set("transcript", panel.transcript);
        const res = await cargarPacienteManualAction({ ok: false }, fd);
        if (!res.ok) {
          setAviso({ tipo: "error", texto: res.mensaje ?? "No se pudo guardar." });
          return;
        }
        setAviso({ tipo: "ok", texto: "Paciente cargado." });
      }
      setPanel({ kind: "closed" });
      router.refresh(); // refresca la lista en vivo
    } finally {
      setGuardando(false);
    }
  }

  async function subirExcel(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setGuardando(true);
    setAviso(null);
    try {
      const res = await subirExcelAction({ ok: false }, fd);
      if (!res.ok) {
        setAviso({ tipo: "error", texto: res.mensaje ?? "No se pudo subir el archivo." });
        return;
      }
      const r = res.resumen;
      setAviso({
        tipo: "ok",
        texto: r
          ? `Excel procesado: ${r.newPatients} nuevos, ${r.mergedPatients} fusionados.`
          : "Excel procesado.",
      });
      router.refresh();
    } finally {
      setGuardando(false);
    }
  }

  const exportHref = activeHospitalId
    ? isScoped
      ? "/admin/export"
      : `/admin/export?hospitalId=${activeHospitalId}`
    : null;

  return (
    <div className="space-y-6">
      {/* Cabecera: hospital fijo (acotado) o selector (global) + contador. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-text">Cargar pacientes</h1>
          {isScoped ? (
            <Badge variant="primary">{activeHospitalName ?? "Tu hospital"}</Badge>
          ) : (
            <select
              className={cn(fieldClass, "h-[44px] w-auto py-0")}
              value={activeHospitalId ?? ""}
              onChange={(ev) => {
                const id = ev.target.value;
                router.push(id ? `/admin/cargar?hospitalId=${id}` : "/admin/cargar");
              }}
            >
              <option value="">Elige un hospital…</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          )}
          <Badge variant="muted">{items.length} en la lista</Badge>
        </div>
        {exportHref && (
          <a href={exportHref} download>
            <Button variant="outline">Descargar mi Excel</Button>
          </a>
        )}
      </div>

      {aviso && (
        <Card className={aviso.tipo === "error" ? "border-danger/30 bg-danger/5" : "border-success/30 bg-success/5"}>
          <CardBody className="py-3">
            <p className={cn("text-sm font-medium", aviso.tipo === "error" ? "text-danger" : "text-success")}>
              {aviso.texto}
            </p>
          </CardBody>
        </Card>
      )}

      {sinHospital && (
        <Card>
          <CardBody>
            <p className="text-sm text-text-2">Elige un hospital para empezar a cargar pacientes.</p>
          </CardBody>
        </Card>
      )}

      {!sinHospital && (
        <>
          {/* Acciones de captura. */}
          <div className="flex flex-wrap gap-3">
            {recording ? (
              <Button variant="danger" onClick={detenerGrabacion}>
                ⏹ Detener y transcribir
              </Button>
            ) : (
              <Button onClick={iniciarGrabacion} disabled={dictando}>
                {dictando ? "Transcribiendo…" : "🎤 Dictar"}
              </Button>
            )}
            <Button variant="outline" onClick={abrirManual} disabled={recording || dictando}>
              ✍️ Manual
            </Button>
          </div>

          {/* Aviso de privacidad: el audio va a un servicio externo y NO se guarda. */}
          <p className="text-xs text-text-3">
            Al dictar, el audio se envía a un servicio externo de transcripción y se descarta tras
            procesarlo. No se almacena la grabación. Avisa de esto al personal.
          </p>

          {/* Panel de confirmación compartido (dictado / manual / edición). */}
          {panel.kind !== "closed" && (
            <Card>
              <CardBody className="space-y-4">
                <CardTitle>
                  {panel.kind === "edit" ? "Editar paciente" : "Confirmar paciente"}
                </CardTitle>
                <form onSubmit={guardarPanel} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1">
                      <span className="text-sm text-text-2">Nombre y apellidos</span>
                      <Input name="fullName" defaultValue={panel.fields.fullName} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-text-2">Cédula / ID</span>
                      <Input name="documentNumber" defaultValue={panel.fields.documentNumber} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-text-2">Edad</span>
                      <Input name="age" inputMode="numeric" defaultValue={panel.fields.age} />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-text-2">Teléfono</span>
                      <Input name="phone" defaultValue={panel.fields.phone} />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-sm text-text-2">Dirección</span>
                      <Input name="address" defaultValue={panel.fields.address} />
                    </label>
                    <label className="space-y-1 sm:col-span-2">
                      <span className="text-sm text-text-2">Notas clínicas / observaciones</span>
                      <textarea
                        name="clinicalNotes"
                        rows={3}
                        defaultValue={panel.fields.clinicalNotes}
                        className={fieldClass}
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-sm text-text-2">Estado</span>
                      <select name="status" defaultValue={panel.fields.status} className={fieldClass}>
                        {STATUS_ORDER.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 self-end pb-3">
                      <input
                        type="checkbox"
                        name="deceased"
                        defaultChecked={panel.fields.deceased}
                        className="h-5 w-5"
                      />
                      <span className="text-sm text-text-2">¿Falleció?</span>
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <Button type="submit" disabled={guardando}>
                      {guardando ? "Guardando…" : panel.kind === "edit" ? "Guardar cambios" : "Confirmar"}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setPanel({ kind: "closed" })}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}

          {/* Subir Excel (la carga por archivo se integra aquí). */}
          <Card>
            <CardBody className="space-y-3">
              <CardTitle>Subir Excel</CardTitle>
              <form onSubmit={subirExcel} className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  name="archivo"
                  accept=".xlsx,.xls"
                  required
                  className="text-sm text-text-2"
                />
                <Button type="submit" variant="outline" disabled={guardando}>
                  Procesar archivo
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Lista en vivo de lo cargado por este hospital. */}
          <Card>
            <CardBody className="space-y-3">
              <CardTitle>Pacientes del hospital</CardTitle>
              {items.length === 0 ? (
                <p className="text-sm text-text-3">Todavía no hay pacientes cargados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-text-3">
                        <th className="py-2 pr-4">Nombre</th>
                        <th className="py-2 pr-4">Cédula</th>
                        <th className="py-2 pr-4">Edad</th>
                        <th className="py-2 pr-4">Estado</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.patientId} className="border-t border-border">
                          <td className="py-2 pr-4 text-text">{it.fullName ?? "—"}</td>
                          <td className="py-2 pr-4 text-text-2">{it.documentNumber ?? "—"}</td>
                          <td className="py-2 pr-4 text-text-2">{it.age ?? "—"}</td>
                          <td className="py-2 pr-4">
                            <Badge variant={it.status === "deceased" ? "danger" : "muted"}>
                              {STATUS_LABELS[it.status]}
                            </Badge>
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => abrirEdicion(it)}
                              className="font-medium text-primary hover:underline"
                            >
                              ✏️ Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
