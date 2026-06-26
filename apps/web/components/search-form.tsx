"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buildSearchTerm } from "@evzla/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Card de búsqueda (specs/0004 A1 · 0006 §3.2). Tres campos Nombre · Apellido ·
 * Cédula (opcional) que se combinan en el único `termino` que consume el RPC
 * (helper puro buildSearchTerm). Móvil: apilados; desde `md`: en fila.
 */
export function SearchForm(): React.ReactElement {
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [documentId, setDocumentId] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const termino = buildSearchTerm({ name, surname, documentId });
    router.push(`/buscar?termino=${encodeURIComponent(termino)}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4 md:items-end">
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-sm font-medium text-text-2">
            Nombre
          </label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. María"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="surname" className="text-sm font-medium text-text-2">
            Apellido
          </label>
          <Input
            id="surname"
            name="surname"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            placeholder="Ej. Rondón"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="documentId" className="text-sm font-medium text-text-2">
            Cédula <span className="text-text-3">(opcional)</span>
          </label>
          <Input
            id="documentId"
            name="documentId"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="Ej. 12345678"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Buscar
        </Button>
      </div>

      <p className="text-sm text-text-2">
        Solo verás el hospital y un teléfono de ayuda. Nada de datos médicos.
      </p>
    </form>
  );
}
