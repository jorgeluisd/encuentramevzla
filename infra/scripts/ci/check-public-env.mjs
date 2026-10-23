import { readFileSync } from "node:fs";
import process from "node:process";

const PUBLIC_PREFIX = "NEXT_PUBLIC_";
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function fail(messages) {
  for (const message of messages) process.stderr.write(`check-public-env: ${message}\n`);
  process.exit(1);
}

function readLines(envFile) {
  if (!envFile) fail(["falta la ruta del archivo"]);
  try {
    return readFileSync(envFile, "utf8").split(/\r?\n/);
  } catch {
    return fail(["no se pudo leer el archivo"]);
  }
}

function violationOf(rawLine, lineNumber) {
  const line = rawLine.trim();
  if (line === "" || line.startsWith("#")) return [];
  const key = ASSIGNMENT.exec(line)?.[1];
  if (key === undefined) return [`línea ${lineNumber}: no es una asignación CLAVE=valor`];
  if (key.startsWith(PUBLIC_PREFIX)) return [];
  return [`línea ${lineNumber}: clave ${key} sin prefijo ${PUBLIC_PREFIX}`];
}

const violations = readLines(process.argv[2]).flatMap((line, index) => violationOf(line, index + 1));
if (violations.length > 0) fail(violations);
