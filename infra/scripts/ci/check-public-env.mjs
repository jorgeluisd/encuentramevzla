import process from "node:process";
import { cli } from "./cli.mjs";

const PUBLIC_PREFIX = "NEXT_PUBLIC_";
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

const { fail, readFileOrFail } = cli("check-public-env");

function readLines(envFile) {
  if (!envFile) fail("falta la ruta del archivo");
  return readFileOrFail(envFile, "no se pudo leer el archivo").split(/\r?\n/);
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
if (violations.length > 0) fail(...violations);
