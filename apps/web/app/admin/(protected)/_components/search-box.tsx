"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Buscador genérico: navega a `${basePath}?q=…` (resetea la paginación). Reusable en cualquier lista.
export function SearchBox({
  basePath,
  defaultValue = "",
  placeholder = "Buscar…",
}: {
  basePath: string;
  defaultValue?: string;
  placeholder?: string;
}): React.ReactElement {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);

  function submit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="max-w-xs"
        aria-label={placeholder}
      />
      <Button type="submit" variant="outline">
        Buscar
      </Button>
      {defaultValue && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            router.push(basePath);
          }}
          className="text-sm font-medium text-text-3 hover:underline"
        >
          Limpiar
        </button>
      )}
    </form>
  );
}
