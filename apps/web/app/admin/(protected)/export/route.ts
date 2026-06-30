import { canUpload, CrossHospitalExportError } from "@evzla/core";
import { getCurrentMember } from "@/lib/auth/current-member";
import { exportHospitalPatientsUseCase, auditLogWriter } from "@/lib/composition";
import { SheetjsWorkbookWriter } from "@/lib/infrastructure/patient-registry/sheetjs-workbook-writer";

// Descarga del Excel scoped (público + sensible) de un hospital. Defensa en profundidad:
// re-verifica sesión + rol + scope server-side (no confía en la UI). Audita la descarga.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // defensivo (Vercel Pro): construir el .xlsx no debe colgar.

export async function GET(request: Request): Promise<Response> {
  // 1. Autorización: sesión + membresía activa + rol que puede descargar.
  const current = await getCurrentMember();
  if (current.kind !== "authorized" || !canUpload(current.member.role)) {
    return new Response("No autorizado", { status: 403 });
  }
  const member = current.member;

  // 2. Hospital objetivo: el miembro acotado SOLO el suyo; el global lo pide por query.
  const requested = new URL(request.url).searchParams.get("hospitalId");
  const hospitalId = member.hospitalId ?? requested;
  if (!hospitalId) {
    return new Response("Falta el hospital a exportar.", { status: 400 });
  }

  // 3. Leer filas canónicas (el caso de uso revalida el scope del actor).
  let rows;
  try {
    rows = await exportHospitalPatientsUseCase().execute({
      actor: { role: member.role, hospitalId: member.hospitalId },
      hospitalId,
    });
  } catch (error) {
    if (error instanceof CrossHospitalExportError) {
      return new Response("No puedes exportar otro hospital.", { status: 403 });
    }
    throw error;
  }

  // 4. Construir el .xlsx (mismo header que la ingesta: round-trip limpio).
  const bytes = new SheetjsWorkbookWriter().write(rows);

  // 5. Auditar la descarga (quién, qué hospital, cuántas filas) — sin PII en el log.
  await auditLogWriter().record({
    actorId: member.id,
    action: "export_hospital_patients",
    entity: "hospital",
    entityId: hospitalId,
    payload: { rows: rows.length },
  });

  // Nombre estable y sin PII; el archivo es copia de respaldo (la DB es la fuente de verdad).
  const filename = `pacientes-${hospitalId}.xlsx`;
  return new Response(bytes as BlobPart, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
