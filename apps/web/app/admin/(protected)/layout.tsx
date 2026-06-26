import { redirect } from "next/navigation";
import { getSessionEmail } from "@/lib/supabase/ssr-server";
import { resolveTeamMemberUseCase } from "@/lib/composition";
import { signOutAction } from "@/lib/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";

// Rutas del portal: render por request (usan sesión + DB); nunca estáticas.
export const dynamic = "force-dynamic";

/**
 * Guard del portal del equipo. Server-side:
 *  1. Sin sesión -> redirige al login.
 *  2. Con sesión pero sin membresía ACTIVA -> acceso denegado (sin datos).
 *  3. Miembro activo -> renderiza con chip de usuario + Salir.
 * La autorización por ROL la aplica cada página/acción (canUpload/canModerate).
 */
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.ReactElement> {
  const email = await getSessionEmail();
  if (!email) redirect("/admin/login");

  const result = await resolveTeamMemberUseCase().execute(email);

  if (result.kind !== "authorized") {
    return (
      <Card className="border-danger/30 bg-danger/5">
        <CardBody className="space-y-3">
          <p className="font-semibold text-danger">Acceso denegado</p>
          <p className="text-sm text-text-2">
            La cuenta <span className="font-medium">{email}</span> no está autorizada
            para el portal del equipo. Si crees que es un error, contacta a un
            moderador.
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

  const { member } = result;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-2">{member.email}</span>
          <Badge variant={member.role === "moderator" ? "primary" : "muted"}>
            {member.role === "moderator" ? "Moderador" : "Uploader"}
          </Badge>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Salir
          </Button>
        </form>
      </div>
      {children}
    </div>
  );
}
