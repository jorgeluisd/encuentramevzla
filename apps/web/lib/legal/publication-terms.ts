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
    title: "6. Moderación, retiro y vigencia",
    body: "EncuéntrameVzla se reserva el derecho de revisar, aprobar, editar, rechazar o retirar (dar de baja) cualquier publicación, en cualquier momento, sin previo aviso y a su entera discreción, cuando la considere falsa, engañosa, abusiva, ilegal, comercial, duplicada o ajena al fin humanitario de la plataforma, o cuando reciba reportes de terceros. El retiro de una publicación no genera responsabilidad ni derecho a compensación alguna para quien la publicó. Cualquier persona puede reportar una publicación para su revisión. Las publicaciones tienen una vigencia de 3 meses; al vencer dejan de mostrarse y podrás renovarlas editándolas. Puedes editar o dar de baja tu publicación en cualquier momento mediante el enlace enviado a tu correo.",
  },
  {
    title: "7. Contenido prohibido",
    body: "No se permite publicar servicios de pago, contenido comercial o publicitario, datos de terceros sin autorización, ni información falsa, ilegal o que ponga en riesgo a las personas.",
  },
];
