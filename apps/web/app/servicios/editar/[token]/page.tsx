import type { Metadata } from "next";
import Link from "next/link";
import { findServiceForEdit } from "@/lib/composition";
import { ManageServiceForm } from "@/components/servicios/manage-service-form";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// El enlace mágico no debe indexarse (es un acceso de gestión con token).
export const metadata: Metadata = {
  title: "Gestionar mi publicación",
  robots: { index: false, follow: false },
};

export default async function EditarServicioPage({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<React.ReactElement> {
  const { token } = await params;
  const current = await findServiceForEdit(token);

  if (!current || current.status === "removed") {
    return (
      <Card>
        <CardBody className="space-y-3 py-10 text-center">
          <p className="font-semibold text-text">Enlace no válido</p>
          <p className="text-sm text-text-2">
            El enlace no es válido o la publicación ya no existe.{" "}
            <Link href="/servicios" className="text-primary hover:underline">
              Volver al directorio
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    );
  }

  const expira = current.expiresAt.toLocaleDateString("es-VE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Gestionar mi publicación</h1>
        <p className="text-sm text-text-2">
          Edita los datos o da de baja tu servicio. Tu publicación caduca el{" "}
          <strong>{expira}</strong> (al editarla se renueva por 3 meses más).
        </p>
      </div>
      <ManageServiceForm
        current={{
          token,
          title: current.title,
          category: current.category,
          description: current.description,
          contactPhone: current.contactPhone,
        }}
      />
    </div>
  );
}
