import { redirect } from "next/navigation";
import { canAccessReviewQueue, canManageHospitalTeam, canModerate } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { signOutAction } from "@/lib/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { AdminNav, type AdminNavItem } from "./admin-nav";

// Rutas del portal: render por request (usan sesión + DB); nunca estáticas.
export const dynamic = "force-dynamic";

/**
 * Guard del portal del equipo. Server-side:
 *  1. Sin sesión -> redirige al login.
 *  2. Con sesión pero sin membresía ACTIVA -> acceso denegado (sin datos).
 *  3. Miembro activo -> renderiza con nav + chip de usuario + Salir.
 * La autorización por ROL la aplica cada página/acción (canUpload/canModerate).
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const current = await getCurrentMember();
  if (current.kind === "anonymous") redirect("/admin/login");

  if (current.kind === "unauthorized") {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardBody className="space-y-3">
          <p className="font-semibold text-danger">Acceso denegado</p>
          <p className="text-sm text-text-2">
            La cuenta <span className="font-medium">{current.email}</span> no está
            autorizada para el portal del equipo. Si crees que es un error, contacta a
            un moderador.
          </p>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Salir
            </Button>
          </form>
        </CardBody>
      </Card>
    );
  }

  const { member } = current;

  const navItems: AdminNavItem[] = [
    { href: "/admin/cargar", label: "Cargar" },
    ...(canModerate(member.role)
      ? [{ href: "/admin/metricas", label: "Métricas" }]
      : []),
    ...(canModerate(member.role)
      ? [{ href: "/admin/ingesta", label: "Ingesta" }]
      : []),
    ...(canManageHospitalTeam(member.role)
      ? [{ href: "/admin/equipo", label: "Equipo" }]
      : []),
    ...(canModerate(member.role)
      ? [{ href: "/admin/hospitales", label: "Hospitales" }]
      : []),
    ...(canAccessReviewQueue(member.role)
      ? [{ href: "/admin/review", label: "Revisión" }]
      : []),
    ...(canModerate(member.role)
      ? [{ href: "/admin/servicios", label: "Servicios" }]
      : []),
    ...(canModerate(member.role)
      ? [{ href: "/admin/foreign-rows", label: "Filas ajenas" }]
      : []),
    ...(canModerate(member.role)
      ? [{ href: "/admin/audit", label: "Audit log" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <AdminNav items={navItems} />
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-text-2">{member.email}</span>
            <Badge variant={member.role === "uploader" ? "muted" : "primary"}>
              {member.role === "moderator"
                ? "Moderador"
                : member.role === "hospital_admin"
                  ? "Admin hospital"
                  : "Uploader"}
            </Badge>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="outline">
              Salir
            </Button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
