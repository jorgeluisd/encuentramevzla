"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface AdminNavItem {
  href: string;
  label: string;
}

/** Pestañas del portal admin con subrayado y estado activo (usePathname). */
export function AdminNav({
  items,
}: {
  items: AdminNavItem[];
}): React.ReactElement {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {items.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "border-b-2 py-2 transition-colors",
              isActive
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-text-2 hover:text-text",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
