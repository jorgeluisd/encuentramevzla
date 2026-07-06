// Términos de publicación de servicios solidarios (spec 0023). Fuente única reutilizada
// por la página /servicios/terminos, el modal del formulario de alta y /confianza.
export interface LegalItem {
  title: string;
  body: string;
}

export const PUBLICATION_TERMS: readonly LegalItem[] = [
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
];
