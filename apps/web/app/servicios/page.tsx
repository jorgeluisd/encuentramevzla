import type { Metadata } from "next";
import type { PublicService } from "@evzla/core";
import { listPublishedServicesUseCase } from "@/lib/composition";
import { PublishServiceModal } from "@/components/servicios/publish-service-modal";
import { ServicesDirectory } from "@/components/servicios/services-directory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Servicios solidarios — ayuda gratuita tras el sismo",
  description:
    "Directorio de servicios gratuitos ofrecidos por voluntarios y profesionales tras el sismo en Venezuela: salud, ingeniería, legal, alimentación y más. Publica o encuentra ayuda sin costo.",
  alternates: { canonical: "/servicios" },
};

async function published(): Promise<PublicService[]> {
  try {
    return await listPublishedServicesUseCase().execute();
  } catch {
    return [];
  }
}

export default async function ServiciosPage(): Promise<React.ReactElement> {
  const services = await published();

  return (
    <div className="space-y-10">
      <section className="space-y-3 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">Ayuda gratuita tras el sismo</h1>
        <p className="mx-auto max-w-2xl text-text-2">
          Publica y encuentra servicios solidarios de personas que ofrecen su tiempo y conocimiento
          sin costo: inspección de edificios, atención médica, apoyo legal, alimentación y mucho más.
        </p>
        <div className="flex justify-center py-6">
          <PublishServiceModal />
        </div>
      </section>

      <ServicesDirectory services={services} />
    </div>
  );
}
