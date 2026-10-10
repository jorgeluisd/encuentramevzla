import { redirect } from "next/navigation";

// `/admin` no tiene contenido propio: lleva al acceso del equipo en vez de dar 404.
export default function AdminIndex(): never {
  redirect("/admin/login");
}
