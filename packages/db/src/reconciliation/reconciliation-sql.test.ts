import { describe, expect, it } from "vitest";
import { allStatements } from "./reconciliation-sql";

// Test de integración (nivel SQL): NINGUNA sentencia de escritura toca tablas fuera de
// `reconciliation`, y toda lectura que referencia producción es SELECT (ADR-0008, cero mutación).

const WRITE_VERBS = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE|DROP|ALTER)\b/i;
const PROD_SCHEMAS = /\b(public|sensitive)\./i;

function writeTarget(sql: string): string | null {
  const insert = /INSERT\s+INTO\s+([a-z_]+\.[a-z_]+)/i.exec(sql);
  if (insert) return insert[1]!;
  const update = /UPDATE\s+([a-z_]+\.[a-z_]+)/i.exec(sql);
  if (update) return update[1]!;
  const del = /DELETE\s+FROM\s+([a-z_]+\.[a-z_]+)/i.exec(sql);
  if (del) return del[1]!;
  return null;
}

describe("reconciliation SQL is read-only over production", () => {
  const { writes, reads } = allStatements();

  it("every write statement targets only the reconciliation schema", () => {
    expect(writes.length).toBeGreaterThan(0);
    for (const sql of writes) {
      const target = writeTarget(sql);
      expect(target, `sin target reconocible en: ${sql}`).not.toBeNull();
      expect(target!.startsWith("reconciliation."), `escribe fuera de reconciliation: ${target}`).toBe(true);
    }
  });

  it("no read statement contains a write verb", () => {
    for (const sql of reads) {
      expect(WRITE_VERBS.test(sql), `una lectura contiene verbo de escritura: ${sql}`).toBe(false);
    }
  });

  it("statements that reference public/sensitive are SELECT-only", () => {
    for (const sql of [...writes, ...reads]) {
      if (PROD_SCHEMAS.test(sql)) {
        expect(/^\s*SELECT\b/i.test(sql), `toca producción sin ser SELECT: ${sql}`).toBe(true);
        expect(WRITE_VERBS.test(sql)).toBe(false);
      }
    }
  });
});
