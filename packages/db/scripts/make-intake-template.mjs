// Genera la PLANTILLA de carga para los centros clínicos. Ataca en el origen los errores que
// vimos en prod: cédula corrupta por formato numérico (+0), nombre invertido, nombres de hospital
// inventados/truncados y varios nombres mezclados en una celda.
//
// Requiere DATABASE_URL solo para leer el catálogo de hospitales ACTIVOS (desplegable).
// Uso: DATABASE_URL=<url> node packages/db/scripts/make-intake-template.mjs [salida.xlsx]
import postgres from "postgres";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ExcelJS = require(require.resolve("exceljs", { paths: [path.join(ROOT, "packages/db"), ROOT] }));

const OUT = process.argv[2] ?? path.join(ROOT, "docs/plantilla-carga-pacientes.xlsx");
const ROWS = 600; // filas listas para llenar con validación

const url = process.env.DATABASE_URL;
if (!url) { console.error("⛔ Falta DATABASE_URL (para leer el catálogo de hospitales)."); process.exit(1); }
const sql = postgres(url, { prepare: false, max: 1 });

const centros = (await sql`SELECT name FROM public.hospitals WHERE active=true ORDER BY name`).map((r) => r.name);
await sql.end();

const wb = new ExcelJS.Workbook();
wb.creator = "EncuéntrameVzla";
wb.created = new Date(0); // fecha fija: el generador debe ser determinista

// ---------- Hoja CENTROS (fuente del desplegable) ----------
const cen = wb.addWorksheet("CENTROS");
cen.getColumn(1).width = 42;
cen.getCell("A1").value = "CENTROS AUTORIZADOS";
cen.getCell("A1").font = { bold: true };
centros.forEach((n, i) => (cen.getCell(`A${i + 2}`).value = n));
cen.state = "veryHidden"; // no editable por el usuario, pero alimenta el desplegable
const CEN_REF = `CENTROS!$A$2:$A$${centros.length + 1}`;

// ---------- Hoja INSTRUCCIONES ----------
const ins = wb.addWorksheet("INSTRUCCIONES");
ins.getColumn(1).width = 110;
const lines = [
  ["EncuéntrameVzla — Plantilla de carga de pacientes", "title"],
  ["", ""],
  ["Propósito: reportar pacientes atendidos para ayudar a familias a ubicarlos. Los datos personales NUNCA se muestran al público; solo se informa que hay una coincidencia y el teléfono de la mesa de información.", "p"],
  ["", ""],
  ["CÓMO LLENAR (importante para no generar duplicados ni errores):", "h"],
  ["1) UNA fila por paciente. No juntar varios nombres o variantes en una sola celda.", "p"],
  ["2) APELLIDOS y NOMBRES van en columnas SEPARADAS. No invertir el orden (primero apellidos, luego nombres).", "p"],
  ["3) CÉDULA: solo números, sin puntos ni guiones. Si el paciente no tiene o se desconoce, DEJAR VACÍO (no inventar). La columna ya está en formato TEXTO para no perder ni agregar dígitos (ej.: NO poner un 0 de más).", "p"],
  ["4) CENTRO / HOSPITAL: elegir SIEMPRE de la lista desplegable. No escribir el nombre a mano (evita variantes y hospitales inexistentes).", "p"],
  ["5) CONDICIÓN y SEXO: usar el desplegable.", "p"],
  ["6) EDAD: número. Si es menor de edad y no se sabe la edad exacta, anotarlo en OBSERVACIONES.", "p"],
  ["7) No borrar, renombrar ni reordenar las columnas. No agregar hojas.", "p"],
  ["8) Enviar un archivo por centro. La plataforma se encarga de detectar duplicados: NO consolidar/mezclar registros a mano.", "p"],
  ["9) Borrar la fila de EJEMPLO (amarilla) antes de enviar.", "p"],
  ["", ""],
  ["Campos obligatorios: APELLIDOS, NOMBRES, CONDICIÓN, CENTRO. El resto, si se tiene.", "h"],
];
lines.forEach(([text, kind], i) => {
  const c = ins.getCell(`A${i + 1}`);
  c.value = text;
  c.alignment = { wrapText: true, vertical: "top" };
  if (kind === "title") c.font = { bold: true, size: 14 };
  if (kind === "h") c.font = { bold: true, size: 11 };
});

// ---------- Hoja PACIENTES ----------
const ws = wb.addWorksheet("PACIENTES", { views: [{ state: "frozen", ySplit: 1 }] });
const cols = [
  { header: "APELLIDOS *", key: "ap", width: 22 },
  { header: "NOMBRES *", key: "no", width: 22 },
  { header: "CÉDULA (solo números; vacío si no tiene)", key: "ced", width: 30 },
  { header: "EDAD", key: "edad", width: 8 },
  { header: "SEXO", key: "sexo", width: 8 },
  { header: "CONDICIÓN *", key: "cond", width: 16 },
  { header: "CENTRO / HOSPITAL *", key: "cen", width: 40 },
  { header: "TELÉFONO DE CONTACTO", key: "tel", width: 22 },
  { header: "DIRECCIÓN", key: "dir", width: 28 },
  { header: "OBSERVACIONES", key: "obs", width: 34 },
];
ws.columns = cols;
const header = ws.getRow(1);
header.font = { bold: true, color: { argb: "FFFFFFFF" } };
header.alignment = { wrapText: true, vertical: "middle" };
header.height = 30;
header.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6FEB" } }));

// Cédula SIEMPRE como texto (evita el +0 / notación científica / pérdida de ceros).
ws.getColumn("ced").numFmt = "@";

// Fila de ejemplo (amarilla, para borrar).
const ex = ws.addRow({
  ap: "PÉREZ GONZÁLEZ", no: "MARÍA JOSÉ", ced: "12345678", edad: 34, sexo: "F",
  cond: "Ingresado", cen: centros[0] ?? "", tel: "0412-0000000",
  dir: "—", obs: "EJEMPLO — BORRAR ESTA FILA",
});
ex.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF3B0" } }));

// Validaciones para las filas a llenar.
const sexo = '"F,M"';
const cond = '"Ingresado,Fallecido,Alta,Trasladado"';
for (let r = 2; r <= ROWS + 1; r++) {
  ws.getCell(`E${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [sexo] };
  ws.getCell(`F${r}`).dataValidation = { type: "list", allowBlank: false, formulae: [cond] };
  ws.getCell(`G${r}`).dataValidation = {
    type: "list", allowBlank: false, formulae: [CEN_REF],
    showErrorMessage: true, errorStyle: "stop",
    errorTitle: "Centro no válido", error: "Elegí un centro de la lista.",
  };
  ws.getCell(`D${r}`).dataValidation = {
    type: "whole", allowBlank: true, operator: "between", formulae: [0, 120],
    showErrorMessage: true, errorTitle: "Edad inválida", error: "Debe ser un número entre 0 y 120.",
  };
  ws.getCell(`C${r}`).numFmt = "@";
}

await wb.xlsx.writeFile(OUT);
console.log(`✅ Plantilla generada: ${OUT}`);
console.log(`   Centros en el desplegable: ${centros.length}`);
