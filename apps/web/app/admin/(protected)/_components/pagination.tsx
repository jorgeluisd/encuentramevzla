import Link from "next/link";
import { cn } from "@/lib/utils";

// Paginación compartida del portal. `params` (p.ej. { q }) se preserva entre páginas.
export interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params?: Record<string, string | undefined>;
  noun?: { one: string; many: string };
}

function buildHref(basePath: string, params: Record<string, string | undefined>, page: number): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) sp.set(key, value);
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Link estilado como botón outline; deshabilitado = span inerte (un <a> no soporta disabled).
function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const base = cn(
    "inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-border px-4 text-sm font-semibold transition-colors",
    "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
    disabled ? "pointer-events-none opacity-50" : "bg-bg text-text hover:bg-surface",
  );
  if (disabled) {
    return (
      <span className={base} aria-disabled>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={base}>
      {children}
    </Link>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  params = {},
  noun = { one: "resultado", many: "resultados" },
}: PaginationProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      <p className="text-sm text-text-3">
        Página {page} de {totalPages} · {total} {total === 1 ? noun.one : noun.many}
      </p>
      {totalPages > 1 && (
        <div className="flex gap-2">
          <PageLink href={buildHref(basePath, params, page - 1)} disabled={page <= 1}>
            Anterior
          </PageLink>
          <PageLink href={buildHref(basePath, params, page + 1)} disabled={page >= totalPages}>
            Siguiente
          </PageLink>
        </div>
      )}
    </div>
  );
}
