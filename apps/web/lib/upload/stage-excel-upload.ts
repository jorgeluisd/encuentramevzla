import { prepararSubidaExcelAction } from "@/lib/actions/ingesta";
import { XLSX_CONTENT_TYPE } from "@/lib/infrastructure/uploads/xlsx-content-type";

// En AWS sube el .xlsx directo a S3 (Lambda no acepta cuerpos > ~6 MB) y reemplaza el archivo
// del FormData por la clave del objeto. Sin bucket (dev local) deja el FormData tal cual.
export async function stageExcelUpload(formData: FormData): Promise<FormData | { error: string }> {
  const file = formData.get("archivo");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo .xlsx válido." };

  const plan = await prepararSubidaExcelAction({ name: file.name, size: file.size });
  if (plan.mode === "error") return { error: plan.mensaje };
  if (plan.mode === "direct") return formData;

  const put = await fetch(plan.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": XLSX_CONTENT_TYPE },
  }).catch(() => null);
  if (!put?.ok) return { error: "No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo." };

  const staged = new FormData();
  for (const [name, value] of formData.entries()) {
    if (name !== "archivo") staged.append(name, value);
  }
  staged.set("objectKey", plan.key);
  return staged;
}
