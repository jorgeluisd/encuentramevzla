// Datos estáticos de presentación (specs/0011 §3). Fuente: docs/contactos emergencia.jpeg.
// Información pública oficial; no toca datos sensibles.

/** Un contacto telefónico: una etiqueta con uno o más números mostrados. */
export type PhoneContact = {
  readonly label: string;
  readonly phones: readonly string[];
};

/** Un recurso informativo sin teléfono (app, web). */
export type InfoContact = {
  readonly label: string;
  readonly detail: string;
};

export type ContactGroup = {
  readonly title: string;
  readonly note?: string;
  readonly phones?: readonly PhoneContact[];
  readonly info?: readonly InfoContact[];
};

export const EMERGENCY_GROUPS: readonly ContactGroup[] = [
  {
    title: "Líneas generales",
    note: "Emergencias según tu operadora telefónica.",
    phones: [
      { label: "Emergencias / Movistar", phones: ["911"] },
      { label: "CANTV (fijos)", phones: ["171"] },
      { label: "Digitel", phones: ["112"] },
      { label: "Movilnet", phones: ["*1"] },
    ],
  },
  {
    title: "Protección Civil",
    phones: [
      { label: "La Guaira", phones: ["0424-2075335"] },
      { label: "Caracas (Central)", phones: ["(0212) 575-1823", "(0212) 631-8662"] },
      { label: "Caracas (Libertador)", phones: ["0800-725-3661", "(0212) 541-0830"] },
      { label: "Nacionales", phones: ["0800-5588427", "0800-2668446"] },
    ],
  },
  {
    title: "Bomberos",
    phones: [
      { label: "La Guaira", phones: ["(0212) 332-7620", "(0212) 331-0445"] },
      { label: "Caracas Metropolitana", phones: ["(0212) 545-4545", "(0212) 542-0243"] },
    ],
  },
  {
    title: "Seguridad, sismos y desaparecidos",
    phones: [
      { label: "Policía Nacional", phones: ["0800-765-4242"] },
      { label: "FUNVISIS (sismos) · 0-800-TEMBLOR", phones: ["0-800-836-2567"] },
    ],
    info: [
      { label: "VENApp", detail: "App oficial para reportar personas desaparecidas." },
      {
        label: "Desaparecidos Terremoto Venezuela",
        detail: "Web de registro y búsqueda de personas desaparecidas.",
      },
    ],
  },
] as const;
