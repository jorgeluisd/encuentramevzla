import { redirect } from "next/navigation";

// La búsqueda dejó de vivir en la URL (anti-enumeración, spec 0016): se hace por
// Server Action con verificación Turnstile en la home. /buscar queda como redirect
// de compatibilidad para enlaces antiguos.
export default function BuscarPage(): never {
  redirect("/");
}
