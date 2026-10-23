import { lstatSync, readdirSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const BUNDLE_DIR = ".open-next";

// Los patrones se arman por partes para que este archivo no case con el escaneo de secretos del repo.
const SECRET_PATTERNS = [
  new RegExp("AKIA" + "[0-9A-Z]{16}"),
  new RegExp("aws_secret_access" + "_key" + "\\s*[=:]\\s*[\"']?[A-Za-z0-9/+]{40}"),
  new RegExp("-----BEGIN " + "[^\\n]*" + "PRIVATE KEY" + "-----"),
];

function fail(messages) {
  for (const message of messages) process.stderr.write(`check-bundle: ${message}\n`);
  process.exit(1);
}

function readEntries(listFile) {
  if (!listFile) fail(["falta la ruta de la lista de entradas del tar"]);
  try {
    return readFileSync(listFile, "utf8").split(/\r?\n/);
  } catch {
    return fail(["no se pudo leer la lista de entradas del tar"]);
  }
}

function isBundleEntry(entry) {
  const segments = entry.split("/").filter((segment) => segment !== "");
  return (
    !entry.startsWith("/") &&
    segments[0] === BUNDLE_DIR &&
    segments.every((segment) => segment !== ".." && segment !== ".")
  );
}

function checkTarEntries(listFile) {
  const entries = readEntries(listFile);
  if (entries.every((entry) => entry.trim() === "")) fail(["el tar no tiene entradas"]);
  const violations = entries.flatMap((entry, index) =>
    entry === "" || isBundleEntry(entry) ? [] : [`entrada ${index + 1} del tar fuera de ${BUNDLE_DIR}/`],
  );
  if (violations.length > 0) fail(violations);
}

function bundleRoot(dir) {
  if (!dir) fail(["falta la ruta del bundle"]);
  let stats;
  try {
    stats = lstatSync(dir);
  } catch {
    return fail(["el bundle no existe"]);
  }
  if (!stats.isDirectory()) fail(["la raíz del bundle no es un directorio"]);
  return realpathSync(dir);
}

function hasOutputManifest(root) {
  try {
    return lstatSync(path.join(root, "open-next.output.json")).isFile();
  } catch {
    return false;
  }
}

function isForbiddenName(name) {
  const lower = name.toLowerCase();
  return lower === ".env" || lower.startsWith(".env.") || lower.endsWith(".pem") || lower.endsWith(".key");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function hasSecret(file) {
  const contents = readFileSync(file).toString("latin1");
  return SECRET_PATTERNS.some((pattern) => pattern.test(contents));
}

function violationOf(root, dir, entry) {
  const full = path.join(dir, entry.name);
  const label = JSON.stringify(path.relative(root, full));
  if (entry.isDirectory()) return violationsIn(root, full);
  if (!entry.isFile() && !entry.isSymbolicLink()) return [`${label}: tipo de archivo no permitido`];
  if (isForbiddenName(entry.name)) return [`${label}: nombre de archivo prohibido`];
  if (entry.isSymbolicLink()) {
    return isInside(root, path.resolve(dir, readlinkSync(full))) ? [] : [`${label}: symlink fuera del bundle`];
  }
  return hasSecret(full) ? [`${label}: contenido con patrón de secreto`] : [];
}

function violationsIn(root, dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => violationOf(root, dir, entry));
}

function checkBundle(dir) {
  const root = bundleRoot(dir);
  if (!hasOutputManifest(root)) fail(["falta open-next.output.json"]);
  const violations = violationsIn(root, root);
  if (violations.length > 0) fail(violations);
}

if (process.argv[2] === "--tar-entries") checkTarEntries(process.argv[3]);
else checkBundle(process.argv[2]);
