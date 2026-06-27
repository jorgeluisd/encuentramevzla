import { IngestaClient } from "./ingesta-client";

// Red de seguridad de tiempo para archivos en el límite. Hobby tope 60s; el peso
// real lo lleva el bulk insert (segundos). Si se pasa a Vercel Pro, subir a 300.
export const maxDuration = 60;
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
