"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Hospital } from "@evzla/core";
import {
  actualizarHospitalAction,
  crearHospitalAction,
  type EstadoHospital,
} from "@/lib/actions/hospitales";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Modal } from "../_components/modal";
import { SearchBox } from "../_components/search-box";

interface Props {
  hospitals: Hospital[];
  query: string;
}

const fieldClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3 text-text " +
  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

export function HospitalesClient({ hospitals, query }: Props): React.ReactElement {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Hospital | null>(null);

  async function run(
    action: (prev: EstadoHospital, fd: FormData) => Promise<EstadoHospital>,
    fd: FormData,
  ): Promise<EstadoHospital> {
    setBusy(true);
    setAviso(null);
    try {
      const res = await action({ ok: false }, fd);
      setAviso({ tipo: res.ok ? "ok" : "error", texto: res.mensaje ?? (res.ok ? "Listo." : "Error.") });
      if (res.ok) router.refresh();
      return res;
    } finally {
      setBusy(false);
    }
  }

  const onCreate = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void run(crearHospitalAction, new FormData(e.currentTarget)).then((res) => {
      if (res.ok) setCreating(false);
    });
  };

  const onEdit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    void run(actualizarHospitalAction, new FormData(e.currentTarget)).then((res) => {
      if (res.ok) setEditing(null);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Hospitales</h1>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setAviso(null);
            setCreating(true);
          }}
        >
          + Nuevo hospital
        </Button>
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

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Catálogo</CardTitle>
            <SearchBox basePath="/admin/hospitales" defaultValue={query} placeholder="Buscar por nombre…" />
          </div>
          {hospitals.length === 0 ? (
            <p className="text-sm text-text-3">
              {query ? "Sin resultados para esa búsqueda." : "Todavía no hay hospitales."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-3">
                    <th className="py-2 pr-4">Nombre</th>
                    <th className="py-2 pr-4">Ciudad</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2 pr-4">Test</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {hospitals.map((h) => (
                    <tr key={h.id} className="border-t border-border align-middle">
                      <td className="py-2 pr-4 text-text">{h.name}</td>
                      <td className="py-2 pr-4 text-text-2">{h.city ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <Badge variant={h.active ? "success" : "muted"}>
                          {h.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {h.test ? <Badge variant="warning">Sí</Badge> : <span className="text-text-3">—</span>}
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="md"
                          className="h-[40px]"
                          disabled={busy}
                          onClick={() => {
                            setAviso(null);
                            setEditing(h);
                          }}
                        >
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Crear hospital */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo hospital">
        <form onSubmit={onCreate} className="space-y-4">
          <Input name="name" placeholder="Nombre del hospital" required />
          <Input name="city" placeholder="Ciudad (opcional)" />
          <Input name="infoDeskPhone" placeholder="Tel. mesa de información (opcional)" />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      {/* Editar hospital */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Editar hospital">
        {editing && (
          <form onSubmit={onEdit} className="space-y-4">
            <input type="hidden" name="id" value={editing.id} />
            <div className="space-y-1">
              <label htmlFor="h-name" className="text-sm text-text-3">
                Nombre
              </label>
              <Input id="h-name" name="name" defaultValue={editing.name} required />
            </div>
            <div className="space-y-1">
              <label htmlFor="h-city" className="text-sm text-text-3">
                Ciudad
              </label>
              <Input id="h-city" name="city" defaultValue={editing.city ?? ""} placeholder="Opcional" />
            </div>
            <div className="space-y-1">
              <label htmlFor="h-phone" className="text-sm text-text-3">
                Tel. mesa de información
              </label>
              <Input
                id="h-phone"
                name="infoDeskPhone"
                defaultValue={editing.infoDeskPhone ?? ""}
                placeholder="Opcional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="h-active" className="text-sm text-text-3">
                  Estado
                </label>
                <select id="h-active" name="active" defaultValue={String(editing.active)} className={fieldClass}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="h-test" className="text-sm text-text-3">
                  Test (oculto del buscador)
                </label>
                <select id="h-test" name="test" defaultValue={String(editing.test)} className={fieldClass}>
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                Guardar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
