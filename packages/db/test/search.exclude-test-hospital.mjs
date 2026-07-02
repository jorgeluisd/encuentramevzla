// Test: un hospital marcado `test = true` queda EXCLUIDO del buscador público,
// pero sus datos siguen en la BD (visibles en /admin vía listActive, que NO filtra
// por test). Corre contra 0015. Requiere Postgres local (ver local-db.mjs).
//   node packages/db/test/search.exclude-test-hospital.mjs
import assert from "node:assert/strict";
import { connect, loadSchema, search } from "./local-db.mjs";

const sql = connect();
let failed = 0;
const eq = (name, got, want) => {
  try {
    assert.deepEqual([...got].sort(), [...want].sort());
    console.log(`  ✅ ${name}`);
  } catch {
    failed++;
    console.log(`  ❌ ${name}\n     got:  ${JSON.stringify(got)}\n     want: ${JSON.stringify(want)}`);
  }
};

// Siembra un hospital real (test=false) y uno de pruebas (test=true), cada uno con
// un paciente de nombre y cédula distintos.
async function seedWithTestHospital(sql) {
  const [real] = await sql`INSERT INTO public.hospitals (name, info_desk_phone, active, test)
    VALUES ('Hospital Central', '0212-5550000', true, false) RETURNING id`;
  const [tst] = await sql`INSERT INTO public.hospitals (name, info_desk_phone, active, test)
    VALUES ('Hospital de Pruebas', '0000-0000000', true, true) RETURNING id`;

  const rows = [
    { name: "maria real", doc: "V11111111", hid: real.id },
    { name: "maria prueba", doc: "V99999999", hid: tst.id },
  ];
  for (const p of rows) {
    const [row] = await sql`INSERT INTO public.patients (normalized_name, normalized_doc_number, status)
      VALUES (${p.name}, ${p.doc}, 'admitted') RETURNING id`;
    await sql`INSERT INTO public.admissions (patient_id, hospital_id, status)
      VALUES (${row.id}, ${p.hid}, 'admitted')`;
  }
}

try {
  await loadSchema(sql, { searchMigration: "0015_search_patient_exclude_test.sql" });
  await seedWithTestHospital(sql);
  console.log("\n== exclude test hospital (0015) ==");

  // Nombre compartido: solo debe salir el del hospital real.
  eq('"maria" → solo maria real', await search(sql, "maria"), ["maria real"]);
  // El paciente del hospital de pruebas no sale ni por su nombre exacto…
  eq('"maria prueba" → sin resultados', await search(sql, "maria prueba"), []);
  // …ni por su cédula exacta.
  eq("cédula V99999999 → sin resultados", await search(sql, "V99999999"), []);
  // Control: el paciente real sigue saliendo por cédula.
  eq("cédula V11111111 → maria real", await search(sql, "V11111111"), ["maria real"]);

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
