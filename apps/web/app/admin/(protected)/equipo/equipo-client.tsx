"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, TeamMember } from "@evzla/core";
import {
  crearHospitalAction,
  invitarMiembroAction,
  setAccesoMiembroAction,
  type EstadoEquipo,
} from "@/lib/actions/equipo";
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
  isGlobal: boolean;
  hospitals: HospitalRef[];
  members: TeamMember[];
  hospitalName: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  uploader: "Uploader",
  hospital_admin: "Admin hospital",
  moderator: "Moderador",
};

const fieldClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3 text-text " +
  "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

export function EquipoClient({ isGlobal, hospitals, members, hospitalName }: Props): React.ReactElement {
  const router = useRouter();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Roles que el actor puede asignar: el global todos; el hospital_admin solo los acotados.
  const assignableRoles: Role[] = isGlobal
    ? ["uploader", "hospital_admin", "moderator"]
    : ["uploader", "hospital_admin"];

  const nameOf = (hospitalId: string | null): string =>
    hospitalId === null
      ? "Global"
      : (hospitals.find((h) => h.id === hospitalId)?.name ?? hospitalId);

  async function run(
    action: (prev: EstadoEquipo, fd: FormData) => Promise<EstadoEquipo>,
    fd: FormData,
    form?: HTMLFormElement,
  ): Promise<void> {
    setBusy(true);
    setAviso(null);
    try {
      const res = await action({ ok: false }, fd);
      setAviso({ tipo: res.ok ? "ok" : "error", texto: res.mensaje ?? (res.ok ? "Listo." : "Error.") });
      if (res.ok) {
        form?.reset();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const onSubmit =
    (action: (prev: EstadoEquipo, fd: FormData) => Promise<EstadoEquipo>) =>
    (e: React.FormEvent<HTMLFormElement>): void => {
      e.preventDefault();
      void run(action, new FormData(e.currentTarget), e.currentTarget);
    };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-text">Equipo</h1>
        {isGlobal ? (
          <Badge variant="primary">Global</Badge>
        ) : (
          <Badge variant="primary">{hospitalName ?? "Tu hospital"}</Badge>
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

      {/* Alta de hospital: solo el global. */}
      {isGlobal && (
        <Card>
          <CardBody className="space-y-3">
            <CardTitle>Crear hospital</CardTitle>
            <form onSubmit={onSubmit(crearHospitalAction)} className="grid gap-3 sm:grid-cols-3">
              <Input name="name" placeholder="Nombre del hospital" required />
              <Input name="city" placeholder="Ciudad (opcional)" />
              <Input name="infoDeskPhone" placeholder="Tel. mesa de información (opcional)" />
              <div className="sm:col-span-3">
                <Button type="submit" disabled={busy}>
                  Crear hospital
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Invitar miembro (allow-list + magic-link). */}
      <Card>
        <CardBody className="space-y-3">
          <CardTitle>Invitar miembro</CardTitle>
          <form onSubmit={onSubmit(invitarMiembroAction)} className="grid gap-3 sm:grid-cols-3">
            <Input name="email" type="email" placeholder="correo@dominio" required />
            <select name="role" defaultValue="uploader" className={fieldClass}>
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            {isGlobal ? (
              <select name="hospitalId" defaultValue="" className={fieldClass}>
                <option value="">Hospital (no aplica a moderador)</option>
                {hospitals.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center text-sm text-text-3">
                Se añadirá a {hospitalName ?? "tu hospital"}.
              </div>
            )}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={busy}>
                Invitar
              </Button>
            </div>
          </form>
          <p className="text-xs text-text-3">
            Al invitar, el correo queda habilitado en la allow-list. La persona entra con su correo
            (magic-link) desde la pantalla de acceso.
          </p>
        </CardBody>
      </Card>

      {/* Personal existente: cambiar rol / activar-desactivar. */}
      <Card>
        <CardBody className="space-y-3">
          <CardTitle>Personal</CardTitle>
          {members.length === 0 ? (
            <p className="text-sm text-text-3">Todavía no hay miembros.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-text-3">
                    <th className="py-2 pr-4">Correo</th>
                    {isGlobal && <th className="py-2 pr-4">Hospital</th>}
                    <th className="py-2 pr-4">Rol</th>
                    <th className="py-2 pr-4">Estado</th>
                    <th className="py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id} className="border-t border-border align-middle">
                      <td className="py-2 pr-4 text-text">{m.email}</td>
                      {isGlobal && <td className="py-2 pr-4 text-text-2">{nameOf(m.hospitalId)}</td>}
                      <td className="py-2 pr-4">
                        <form
                          onSubmit={onSubmit(setAccesoMiembroAction)}
                          className="flex items-center gap-2"
                        >
                          <input type="hidden" name="memberId" value={m.id} />
                          <select key={m.role} name="role" defaultValue={m.role} className={cn(fieldClass, "h-[40px] w-auto py-0")}>
                            {assignableRoles.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="outline" size="md" disabled={busy} className="h-[40px]">
                            Guardar
                          </Button>
                        </form>
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={m.active ? "success" : "muted"}>
                          {m.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <form
                          onSubmit={onSubmit(setAccesoMiembroAction)}
                          className="inline"
                        >
                          <input type="hidden" name="memberId" value={m.id} />
                          <input type="hidden" name="active" value={m.active ? "false" : "true"} />
                          <button
                            type="submit"
                            disabled={busy}
                            className={cn(
                              "font-medium hover:underline",
                              m.active ? "text-danger" : "text-primary",
                            )}
                          >
                            {m.active ? "Desactivar" : "Activar"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
