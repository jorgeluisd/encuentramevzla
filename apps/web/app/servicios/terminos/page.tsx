import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Términos de publicación — Servicios solidarios",
  description:
    "Condiciones para publicar servicios solidarios en EncuéntrameVzla: naturaleza del servicio, responsabilidad del contenido, publicación pública y moderación.",
  alternates: { canonical: "/servicios/terminos" },
};

const TERMS = [
  {
    title: "1. Naturaleza del servicio",
    body: "EncuéntrameVzla es una iniciativa humanitaria sin fines de lucro que ofrece únicamente un espacio de difusión (“tablón”) para que personas y profesionales publiquen, de forma voluntaria y gratuita, servicios de ayuda tras la emergencia. EncuéntrameVzla no presta estos servicios, no es parte de ninguna relación entre quien ofrece y quien solicita, y no cobra por ellos.",
  },
  {
    title: "2. Sin verificación ni aval",
    body: "EncuéntrameVzla no verifica, no avala, no recomienda ni garantiza la identidad, idoneidad, calidad, seguridad, legalidad ni los resultados de los servicios publicados. La publicación no constituye una recomendación de EncuéntrameVzla.",
  },
  {
    title: "3. Responsabilidad del contenido",
    body: "Cada publicación es responsabilidad exclusiva de quien la envía. Quien publica declara que la información es veraz, que ofrece el servicio de forma gratuita y que tiene derecho a publicar los datos de contacto incluidos. EncuéntrameVzla no se responsabiliza por el contenido de terceros ni por datos falsos, desactualizados o engañosos.",
  },
  {
    title: "4. Uso bajo propia responsabilidad",
    body: "Quien contacte o utilice un servicio publicado lo hace bajo su propio riesgo y responsabilidad. EncuéntrameVzla no se hace responsable de ningún daño, pérdida, perjuicio, acuerdo, conducta o consecuencia derivada del contacto entre las partes o del uso de la información publicada. Ante una emergencia, comunícate con las líneas oficiales (171 · 911).",
  },
  {
    title: "5. Publicación pública y datos",
    body: "Al publicar, autorizas la divulgación pública del contenido y del número de contacto que proporciones; cualquier persona podrá verlo y contactarte. Tu correo electrónico no se publica: se usa solo para enviarte un enlace de gestión de tu publicación.",
  },
  {
    title: "6. Moderación y vigencia",
    body: "EncuéntrameVzla puede revisar, aprobar, rechazar, editar o retirar cualquier publicación, en cualquier momento y sin previo aviso, especialmente si es falsa, abusiva, ilegal, comercial o ajena al fin humanitario. Las publicaciones tienen una vigencia de 3 meses, tras la cual dejan de mostrarse. Puedes editar o dar de baja tu publicación en cualquier momento mediante el enlace enviado a tu correo.",
  },
  {
    title: "7. Contenido prohibido",
    body: "No se permite publicar servicios de pago, contenido comercial o publicitario, datos de terceros sin autorización, ni información falsa, ilegal o que ponga en riesgo a las personas.",
  },
] as const;

export default function TerminosPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Términos de publicación</h1>
        <p className="text-text-2">Servicios solidarios de EncuéntrameVzla.</p>
      </div>
      <Card>
        <CardBody className="space-y-5">
          {TERMS.map((t) => (
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
