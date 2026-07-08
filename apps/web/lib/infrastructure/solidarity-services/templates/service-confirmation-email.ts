import type { ServiceConfirmationInput } from "@evzla/core";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Confirmación de recepción + enlace mágico de gestión (editar / dar de baja).
export function renderServiceConfirmationEmail(input: ServiceConfirmationInput): string {
  const editUrl = escapeHtml(input.editUrl);
  return `<!doctype html>
<html lang="es">
  <body style="margin:0; background-color:#f8fafc; font-family:'Work Sans',Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; padding:24px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; max-width:600px;">
            <tr>
              <td style="height:6px; background:linear-gradient(90deg,#ffd200,#0033a0,#cf142b);"></td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px; font-size:20px; color:#0033a0;">Recibimos tu publicación</h1>
                <p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#334155;">
                  ¡Gracias por ofrecer tu ayuda! Tu servicio quedó <strong>en revisión</strong>. Un
                  moderador lo aprobará antes de que aparezca en el directorio público.
                </p>
                <p style="margin:0 0 12px; font-size:15px; line-height:1.6; color:#334155;">
                  Con este enlace puedes <strong>editar</strong> o <strong>dar de baja</strong> tu
                  publicación en cualquier momento. No lo compartas: es tu acceso de gestión.
                </p>
                <p style="margin:0 0 12px; font-size:14px; line-height:1.6; color:#334155;">
                  Tu publicación tiene una <strong>vigencia de 3 meses</strong>. Puedes renovarla
                  en cualquier momento editándola desde ese mismo enlace.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${editUrl}" style="display:inline-block; background-color:#0033a0; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:12px 24px; border-radius:6px;">Gestionar mi publicación</a>
                </p>
                <p style="margin:0; font-size:12px; line-height:1.5; color:#94a3b8;">
                  Si no publicaste ningún servicio, ignora este correo. EncuéntrameVzla es una
                  iniciativa humanitaria sin fines de lucro.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
