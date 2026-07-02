// Marca (o desmarca) un hospital como de PRUEBA (hospitals.test). Un hospital test=true
// queda excluido del buscador público pero sigue visible en /admin.
// Dry-run por defecto (ADR-0007); --apply para commitear.
//
//   node packages/db/scripts/mark-hospital-test.mjs --name "Hospital de Pruebas"
//   node packages/db/scripts/mark-hospital-test.mjs --id <uuid> --apply
//   node packages/db/scripts/mark-hospital-test.mjs --name "..." --off --apply   (desmarcar)
import postgres from "postgres";

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const val = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

const id = val("--id");
const name = val("--name");
const apply = flag("--apply");
const target = flag("--off") ? false : true; // por defecto marca como test

if (!id && !name) {
  console.error("Uso: --id <uuid> | --name <nombre exacto>  [--off] [--apply]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
try {
  const rows = id
    ? await sql`SELECT id, name, active, test FROM public.hospitals WHERE id = ${id}`
    : await sql`SELECT id, name, active, test FROM public.hospitals WHERE name = ${name}`;

  if (rows.length === 0) {
    console.error("❌ No se encontró el hospital.");
    process.exitCode = 1;
  } else if (rows.length > 1) {
    console.error(`❌ ${rows.length} hospitales coinciden con ese nombre; usa --id.`);
    rows.forEach((r) => console.error(`   ${r.id}  ${r.name}`));
    process.exitCode = 1;
  } else {
    const h = rows[0];
    console.log(`Hospital: ${h.name} (${h.id})  active=${h.active} test=${h.test}`);
    console.log(`→ set test = ${target}`);
    if (!apply) {
      console.log("\n(dry-run) Nada aplicado. Añade --apply para commitear.");
    } else {
      await sql`UPDATE public.hospitals SET test = ${target} WHERE id = ${h.id}`;
      console.log("✅ Aplicado.");
    }
  }
} catch (e) {
  console.error("💥", e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
