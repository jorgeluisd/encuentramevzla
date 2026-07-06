"use client";

import { useActionState } from "react";
import {
  editServiceAction,
  removeServiceAction,
  type EstadoGestion,
} from "@/lib/actions/servicios";
import { SERVICE_CATEGORIES } from "@evzla/core";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const initial: EstadoGestion = { ok: false };
const fieldClass =
  "w-full rounded-[var(--radius-control)] border border-border bg-bg px-4 py-3 text-text placeholder:text-text-3 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none";

export interface ManageServiceInitial {
  token: string;
  title: string;
  category: string;
  description: string;
  contactPhone: string;
}

export function ManageServiceForm({ current }: { current: ManageServiceInitial }): React.ReactElement {
  const [editState, editForm, editPending] = useActionState(editServiceAction, initial);
  const [removeState, removeForm, removePending] = useActionState(removeServiceAction, initial);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody className="space-y-5">
          <CardTitle>Editar mi publicación</CardTitle>
          <p className="text-sm text-text-2">
            Al guardar cambios, la publicación volverá a revisión antes de mostrarse de nuevo.
          </p>
          <form action={editForm} className="space-y-4">
            <input type="hidden" name="token" value={current.token} />

            <div className="space-y-1.5">
              <label htmlFor="title" className="text-sm font-medium text-text-2">
                Título del servicio
              </label>
              <Input id="title" name="title" required defaultValue={current.title} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="category" className="text-sm font-medium text-text-2">
                  Categoría
                </label>
                <select id="category" name="category" required defaultValue={current.category} className={fieldClass}>
                  {SERVICE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contactPhone" className="text-sm font-medium text-text-2">
                  Número de contacto (público)
                </label>
                <Input id="contactPhone" name="contactPhone" required defaultValue={current.contactPhone} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="description" className="text-sm font-medium text-text-2">
                Descripción
              </label>
              <textarea
                id="description"
                name="description"
                required
                rows={3}
                className={fieldClass}
                defaultValue={current.description}
              />
            </div>

            <Button type="submit" size="lg" disabled={editPending}>
              {editPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {editState.mensaje && (
              <p
                className={`rounded-[var(--radius-control)] px-4 py-3 text-sm ${editState.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                role="status"
              >
                {editState.mensaje}
              </p>
            )}
          </form>
        </CardBody>
      </Card>

      <Card className="border-danger/20 bg-danger/5">
        <CardBody className="space-y-3">
          <CardTitle>Dar de baja</CardTitle>
          <p className="text-sm text-text-2">
            Retira tu publicación del directorio de inmediato. Esta acción no se puede deshacer.
          </p>
          <form action={removeForm}>
            <input type="hidden" name="token" value={current.token} />
            <Button type="submit" variant="danger" disabled={removePending}>
              {removePending ? "Dando de baja…" : "Dar de baja mi publicación"}
            </Button>
            {removeState.mensaje && (
              <p
                className={`mt-3 rounded-[var(--radius-control)] px-4 py-3 text-sm ${removeState.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}
                role="status"
              >
                {removeState.mensaje}
              </p>
            )}
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
