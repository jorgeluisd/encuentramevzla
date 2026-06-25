import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Helper estilo shadcn/ui para componer clases de Tailwind sin conflictos. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
