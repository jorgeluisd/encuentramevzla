import type { Metadata } from "next";
import { Card, CardBody, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacidad y cómo cuidamos los datos",
  description:
    "Cómo EncuéntrameVzla protege la información: búsqueda mediada, sin exponer diagnósticos, edad, teléfonos ni direcciones; solo el hospital donde preguntar.",
};

// Secciones de la política de privacidad (texto humanitario, privacidad mediada).
const SECTIONS = [
  {
    title: "Separación de datos",
    body: "La información sensible (teléfonos, direcciones, observaciones clínicas) vive en un almacén aislado, separado de los datos no sensibles. El buscador público no tiene acceso a ese almacén bajo ninguna circunstancia.",
  },
  {
    title: "Cómo funciona la búsqueda",
    body: "Cuando buscas un nombre o una cédula, no consultas una base de datos abierta: una función controlada decide qué se puede revelar. Te muestra el nombre coincidente y en qué hospital preguntar, agrupado por hospital. Nunca se revelan diagnósticos, edad, teléfonos ni direcciones: solo dónde acudir para que sigas el contacto con el hospital.",
  },
  {
    title: "Anti-abuso",
    body: "Para evitar que alguien recorra nombres al azar, registramos solo una huella (hash) de cada término buscado, nunca el texto, y limitamos la frecuencia de búsquedas.",
  },
  {
    title: "Derecho al olvido",
    body: "Cualquier persona o su familia puede solicitar la eliminación o anonimización de sus datos. El sistema está diseñado para permitir esa baja de forma trazable.",
  },
] as const;

/**
 * `/confianza` — "Tus datos se tratan de forma segura". Explica separación de
 * datos, búsqueda mediada, anti-abuso y derecho al olvido.
 */
export default function ConfianzaPage(): React.ReactElement {
  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Tus datos se tratan de forma segura
        </h1>
        <p className="text-text-2">
          La privacidad de las personas ingresadas es un requisito innegociable de este
          proyecto.
        </p>
      </header>

      <div className="space-y-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardBody className="space-y-2">
              <CardTitle>{section.title}</CardTitle>
              <p className="text-text-2">{section.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </article>
  );
}
