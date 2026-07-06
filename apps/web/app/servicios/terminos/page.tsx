import type { Metadata } from "next";
import Link from "next/link";
import { PUBLICATION_TERMS } from "@/lib/legal/publication-terms";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Términos de publicación — Servicios solidarios",
  description:
    "Condiciones para publicar servicios solidarios en EncuéntrameVzla: naturaleza del servicio, responsabilidad del contenido, publicación pública y moderación.",
  alternates: { canonical: "/servicios/terminos" },
};

export default function TerminosPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Términos de publicación</h1>
        <p className="text-text-2">Servicios solidarios de EncuéntrameVzla.</p>
      </div>
      <Card>
        <CardBody className="space-y-5">
          {PUBLICATION_TERMS.map((t) => (
            <section key={t.title} className="space-y-1.5">
              <h2 className="font-semibold text-text">{t.title}</h2>
              <p className="text-sm leading-relaxed text-text-2">{t.body}</p>
            </section>
          ))}
        </CardBody>
      </Card>
      <p className="text-sm text-text-2">
        <Link href="/servicios" className="text-primary hover:underline">
          Volver al directorio de servicios
        </Link>
      </p>
    </div>
  );
}
