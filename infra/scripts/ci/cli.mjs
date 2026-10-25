import { readFileSync } from "node:fs";
import process from "node:process";

// Solo node:*: el job `resolve` corre estos scripts sin `pnpm install`.

export const SHA = /^[0-9a-f]{40}$/;

const asUtf8 = (buffer) => buffer.toString("utf8");

const PUBLIC_PREFIX = "NEXT_PUBLIC_";
const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

function publicEnvLineViolation(rawLine, lineNumber) {
  const line = rawLine.trim();
  if (line === "" || line.startsWith("#")) return [];
  const key = ASSIGNMENT.exec(line)?.[1];
  if (key === undefined) return [`línea ${lineNumber}: no es una asignación CLAVE=valor`];
  if (key.startsWith(PUBLIC_PREFIX)) return [];
  return [`línea ${lineNumber}: clave ${key} sin prefijo ${PUBLIC_PREFIX}`];
}

export function publicEnvViolations(text) {
  return text.split(/\r?\n/).flatMap((line, index) => publicEnvLineViolation(line, index + 1));
}

export function cli(name) {
  function fail(...messages) {
    for (const message of messages) process.stderr.write(`${name}: ${message}\n`);
    process.exit(1);
  }

  function readFileOrFail(file, message, parse = asUtf8) {
    try {
      return parse(readFileSync(file));
    } catch {
      return fail(message);
    }
  }

  return { fail, readFileOrFail };
}
