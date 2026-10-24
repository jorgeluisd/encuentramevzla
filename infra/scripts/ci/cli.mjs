import { readFileSync } from "node:fs";
import process from "node:process";

// Solo node:*: el job `resolve` corre estos scripts sin `pnpm install`.

export const SHA = /^[0-9a-f]{40}$/;

const asUtf8 = (buffer) => buffer.toString("utf8");

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
