import { roleLabel, type WelcomeMailInput } from "@evzla/core";

// Paleta alineada a los tokens del proyecto (globals.css @theme). Los emails HTML no
// pueden usar variables CSS, así que van hex literales que coinciden con la marca.

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// Bloque de descarga del manual: solo se incluye si hay manualUrl.
function manualBlock(manualUrl: string | null | undefined): string {
  if (!manualUrl) return "";
  return `
            <!-- Manual de Usuario -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff4e5; border-left:4px solid #f57c00; border-radius:4px; margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <h3 style="margin:0 0 8px; font-size:15px; color:#8a4a00; font-weight:700;">📎 Manual de Usuario</h3>
                  <p style="margin:0 0 12px; font-size:14px; line-height:1.5; color:#8a4a00;">
                    Antes de ingresar, por favor lee el <strong>Manual de Usuario Básico</strong>. Contiene las instrucciones para cargar las listas de pacientes, gestionar registros y acceder sin contraseña.
                  </p>
                  <a href="${escapeHtml(manualUrl)}" style="display:inline-block; background-color:#f57c00; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none; padding:10px 20px; border-radius:6px;">Descargar Manual (PDF)</a>
                </td>
              </tr>
            </table>
`;
}

// Cuerpo HTML del correo de bienvenida. Interpola hospital, rol y enlaces reales.
export function renderWelcomeEmail(input: WelcomeMailInput): string {
  const hospital = input.hospitalName
    ? escapeHtml(input.hospitalName)
    : "Acceso global (todos los hospitales)";
  const role = escapeHtml(roleLabel(input.role));
  const loginUrl = escapeHtml(input.loginUrl);

  return `<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5; padding:40px 15px; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:550px; background-color:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e5e8ee; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">

        <!-- Header -->
        <tr>
          <td style="background-color:#1565c0; padding:24px; text-align:center;">
            <span style="color:#ffffff; font-size:22px; font-weight:800; letter-spacing:0.5px;">EncuéntrameVzla</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 32px 16px;">
            <h1 style="margin:0 0 16px; font-size:22px; color:#1a2233; font-weight:700; text-align:center;">¡Gracias por sumarte a nuestro equipo!</h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.6; color:#5a6478;">
              Hola, en nombre de todo el equipo te agradecemos profundamente por unirte a esta iniciativa humanitaria. Tu participación como personal verificado es vital para ayudar a las familias a encontrar a sus seres queridos de forma segura.
            </p>

            <!-- Detalles de asignación -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fb; border:1px solid #e5e8ee; border-radius:8px; margin-bottom:24px;">
              <tr>
                <td style="padding:16px;">
                  <p style="margin:0 0 8px; font-size:14px; color:#5a6478;">🏥 <strong>Hospital / Centro asignado:</strong></p>
                  <p style="margin:0 0 16px; font-size:16px; color:#1a2233; font-weight:600;">${hospital}</p>

                  <p style="margin:0 0 8px; font-size:14px; color:#5a6478;">👤 <strong>Tu rol en la plataforma:</strong></p>
                  <p style="margin:0; font-size:16px; color:#1a2233; font-weight:600;">${role}</p>
                </td>
              </tr>
            </table>
${manualBlock(input.manualUrl)}
            <h2 style="margin:0 0 8px; font-size:16px; color:#1a2233; font-weight:600;">¿Cómo inicio sesión?</h2>
            <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#5a6478;">
              Para garantizar la máxima seguridad y rapidez, <strong>no usamos contraseñas</strong>. Cada vez que necesites entrar al sistema, simplemente ingresa tu correo institucional en la plataforma y te enviaremos un código numérico seguro de un solo uso.
            </p>
          </td>
        </tr>

        <!-- Call to Action -->
        <tr>
          <td align="center" style="padding:0 32px 32px;">
            <a href="${loginUrl}" style="display:inline-block; background-color:#1565c0; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; padding:14px 32px; border-radius:8px;">Ir al Portal de Hospitales</a>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color:#f8f9fb; padding:24px 32px; border-top:1px solid #e5e8ee;">
            <p style="margin:0; font-size:12px; line-height:1.5; color:#657082; text-align:center;">
              Este mensaje es automático y es de uso exclusivo para personal de hospitales y voluntariado verificado. Si crees que esto es un error, por favor comunícate con el administrador del centro.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
