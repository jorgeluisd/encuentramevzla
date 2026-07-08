import type { LegalItem } from "./publication-terms";

// Cláusula de protección y uso de datos personales (la que aparece al abrir el sitio por
// primera vez). Fuente única reutilizada por el modal de entrada (TermsGate) y /confianza.
export const DATA_PROTECTION_INTRO =
  "Al hacer uso de esta aplicación en situaciones de emergencia, usted acepta y reconoce expresamente lo siguiente:";

export const DATA_PROTECTION_CLAUSES: readonly LegalItem[] = [
  {
    title: "Finalidad del tratamiento de datos",
    body: "La información personal y los datos recabados a través de esta aplicación son tratados única y exclusivamente con el fin de facilitar la búsqueda y localización de familiares, amigos o conocidos, incluyendo niñas, niños, adolescentes y personas que se presumen desaparecidas.",
  },
  {
    title: "Interés superior del niño",
    body: "El tratamiento de la información de niñas, niños y adolescentes se realiza en estricto cumplimiento del principio del interés superior, conforme a la normativa venezolana vigente.",
  },
  {
    title: "Reserva de derechos",
    body: "Los desarrolladores de esta aplicación se reservan el derecho de ejercer las acciones legales correspondientes ante los organismos de seguridad competentes frente a cualquier uso inadecuado de la información aquí contenida, en virtud de que la misma tiene como finalidad exclusiva la ubicación de las personas señaladas.",
  },
  {
    title: "Limitación de responsabilidad",
    body: "La aplicación no se hace responsable por el uso, divulgación o manejo de la información compartida con fines distintos a los anteriormente señalados.",
  },
  {
    title: "Advertencia de seguridad",
    body: "Se recomienda al usuario actuar con extrema precaución, siendo consciente de que cualquier uso indebido de los datos personales, contrario a la presente iniciativa, puede generar responsabilidades penales, civiles o administrativas, pudiendo derivar en denuncias o acciones realizadas en nombre propio o en conjunto con familiares.",
  },
];
