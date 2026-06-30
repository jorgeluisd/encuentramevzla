// Golden tests del buscador: fijan QUÉ devuelve search_patient hoy, para que la
// reescritura del WHERE (spec 0018) no cambie resultados. Se corre contra 0008
// (línea base) y contra 0011 (nuevo) — deben dar IDÉNTICO.
//   node packages/db/test/search.golden.mjs [0008|0011]
import assert from "node:assert/strict";
import { connect, loadSchema, seed, search } from "./local-db.mjs";

const which = process.argv[2] === "0011" ? "0011_search_patient_trigram.sql" : "0008_search_patient_rate_limit_threshold.sql";

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

try {
  await loadSchema(sql, { searchMigration: which });
  await seed(sql);
  console.log(`\n== golden (${which}) ==`);

  // 1) Bug histórico: "jorge diaz" no debe traer homónimos parciales.
  eq('"jorge diaz" → solo jorge diaz', await search(sql, "jorge diaz"), ["jorge diaz"]);
  // 2) AND multi-token: exige ambos tokens.
  eq('"ana maria" → solo ana maria rodriguez', await search(sql, "ana maria"), ["ana maria rodriguez"]);
  // 3) Match exacto por cédula.
  eq('cédula V12345678 → jorge diaz', await search(sql, "V12345678"), ["jorge diaz"]);
  // 4) Un token suelto trae todos los que lo contienen.
  eq('"diaz" → jorge y julio diaz', await search(sql, "diaz"), ["jorge diaz", "julio diaz"]);
  // 5) Término < 4 chars → invalid_term (sin resultados de paciente).
  eq('"jo" → sin resultados', await search(sql, "jo"), []);
  // 6) Insensible a acentos: "josé" matchea "jose perez".
  eq('"josé" → jose perez', await search(sql, "josé"), ["jose perez"]);

  console.log(failed === 0 ? "\n✅ TODOS verdes" : `\n❌ ${failed} fallo(s)`);
  process.exitCode = failed === 0 ? 0 : 1;
} catch (e) {
  console.error("💥", e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
