import { IngestaClient } from "./ingesta-client";

// Red de seguridad de tiempo para archivos grandes. Vercel Pro permite hasta 300s;
// el peso real lo lleva el bulk insert (segundos), esto evita el corte por timeout.
export const maxDuration = 300;
export const runtime = "nodejs";

/**
 * `/admin/ingesta` — Portal de carga de listas.
 *
 * Protegido por el guard del grupo (protected): exige sesión + membresía activa.
 * La action re-verifica server-side y registra el `uploadedBy` real.
 */
export default function AdminIngestaPage(): React.ReactElement {
  return <IngestaClient />;
}
