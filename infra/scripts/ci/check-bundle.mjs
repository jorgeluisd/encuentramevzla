import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";
import { cli, publicEnvViolations } from "./cli.mjs";

const BUNDLE_DIR = ".open-next";
const PUBLIC_ENV_FILE = ".env.production";

// Los patrones se arman por partes para que este archivo no case con el escaneo de secretos del repo.
const SECRET_PATTERNS = [
  new RegExp("AKIA" + "[0-9A-Z]{16}"),
  new RegExp("aws_secret_access" + "_key" + "\\s*[=:]\\s*[\"']?[A-Za-z0-9/+]{40}"),
  new RegExp("-----BEGIN " + "[^\\n]*" + "PRIVATE KEY" + "-----"),
];

const TAR_BLOCK = 512;
const TAR_TYPE = { file: "0", oldFile: "\0", hardlink: "1", symlink: "2", directory: "5" };
const TAR_META_TYPE = { longName: "L", longLink: "K", pax: "x" };
const DATA_TYPES = new Set([TAR_TYPE.file, TAR_TYPE.oldFile, ...Object.values(TAR_META_TYPE)]);
const EXTRACTABLE_TYPES = new Set([TAR_TYPE.file, TAR_TYPE.oldFile, TAR_TYPE.symlink, TAR_TYPE.directory]);
const TAR_MAGIC = { posix: "ustar\x0000", gnu: "ustar  \0" };
const PAX_NAME_RECORDS = new Map([
  ["path", { source: TAR_META_TYPE.longName, field: "name" }],
  ["linkpath", { source: TAR_META_TYPE.longLink, field: "linkname" }],
]);
const PAX_INERT_KEYS = new Set(["mtime", "atime", "ctime", "uid", "gid", "uname", "gname"]);
const PAX_INERT_PREFIXES = ["LIBARCHIVE.xattr.", "SCHILY.xattr."];

class CorruptTar extends Error {}
// Lo que tar podría leer distinto que este parser se rechaza en vez de imitarlo.
class AmbiguousTar extends Error {}

const { fail, readFileOrFail } = cli("check-bundle");

function isBundleEntry(entry) {
  const segments = entry.split("/").filter((segment) => segment !== "");
  return (
    !entry.startsWith("/") &&
    segments[0] === BUNDLE_DIR &&
    segments.every((segment) => segment !== ".." && segment !== ".")
  );
}

function readArchive(archiveFile) {
  if (!archiveFile) fail("falta la ruta del tar");
  return readFileOrFail(archiveFile, "no se pudo leer el tar", gunzipSync);
}

function cString(buffer, offset, length) {
  const raw = buffer.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function octal(header, offset, length) {
  const text = cString(header, offset, length).trim();
  if (!/^[0-7]+$/.test(text)) throw new CorruptTar();
  return Number.parseInt(text, 8);
}

function hasValidChecksum(header) {
  let sum = 0;
  for (let index = 0; index < TAR_BLOCK; index += 1) sum += index >= 148 && index < 156 ? 0x20 : (header[index] ?? 0);
  return octal(header, 148, 8) === sum;
}

// tar solo lee la longitud como dígitos decimales; con otra forma descarta el header pax entero.
function paxRecords(body) {
  const records = new Map();
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    const lengthText = space === -1 ? "" : body.subarray(offset, space).toString("latin1");
    if (!/^[1-9][0-9]*$/.test(lengthText)) throw new CorruptTar();
    const end = offset + Number(lengthText);
    if (end > body.length || body[end - 1] !== 0x0a) throw new CorruptTar();
    const record = body.subarray(space + 1, end - 1).toString("utf8");
    const separator = record.indexOf("=");
    if (separator === -1) throw new CorruptTar();
    // tar corta claves y valores en el primer NUL (C string).
    if (record.includes("\0")) throw new AmbiguousTar();
    records.set(record.slice(0, separator), record.slice(separator + 1));
    offset = end;
  }
  return records;
}

function isInertPaxKey(key) {
  return PAX_INERT_KEYS.has(key) || PAX_INERT_PREFIXES.some((prefix) => key.startsWith(prefix));
}

// tar usa `prefix` solo con magic POSIX ustar "00"; con magic GNU tar lo ignora, así que uno no vacío se rechaza.
function headerName(header) {
  const name = cString(header, 0, 100);
  const prefix = cString(header, 345, 155);
  const magic = header.toString("latin1", 257, 265);
  if (magic === TAR_MAGIC.posix) return prefix ? `${prefix}/${name}` : name;
  if (magic === TAR_MAGIC.gnu && prefix === "") return name;
  throw new AmbiguousTar();
}

function withName(pending, source, field, value) {
  if (pending.sources.has(source) || pending[field] !== undefined) throw new AmbiguousTar();
  return { ...pending, sources: new Set([...pending.sources, source]), [field]: value };
}

// GNU tar y bsdtar dan prioridad a pax sobre L/K sin importar el orden: un miembro con ambos se rechaza.
function applyMeta(pending, type, body) {
  if (type === TAR_META_TYPE.longName) return withName(pending, type, "name", cString(body, 0, body.length));
  if (type === TAR_META_TYPE.longLink) return withName(pending, type, "linkname", cString(body, 0, body.length));
  let next = withName(pending, type, "pax", true);
  for (const [key, value] of paxRecords(body)) {
    if (isInertPaxKey(key)) continue;
    const record = PAX_NAME_RECORDS.get(key);
    if (record === undefined || value === "") throw new AmbiguousTar();
    next = withName(next, record.source, record.field, value);
  }
  return next;
}

function isZero(buffer) {
  return buffer.every((byte) => byte === 0);
}

// Se leen los headers del tar en vez de parsear `tar -tv`: ese texto es ambiguo con nombres que contienen
// " -> " o " link to ", depende del locale y difiere entre GNU tar y bsdtar.
function tarMembers(archive) {
  const members = [];
  const noMeta = { sources: new Set() };
  let pending = noMeta;
  let offset = 0;
  while (offset + TAR_BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK);
    // tar deja de leer en el primer bloque de ceros: lo que venga después no se valida ni se extrae.
    if (isZero(header)) {
      if (!isZero(archive.subarray(offset))) throw new CorruptTar();
      return members;
    }
    if (!hasValidChecksum(header)) throw new CorruptTar();
    const name = headerName(header);
    const size = octal(header, 124, 12);
    const bodyStart = offset + TAR_BLOCK;
    if (bodyStart + size > archive.length) throw new CorruptTar();
    const body = archive.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    const type = String.fromCharCode(header[156] ?? 0);
    // tar ignora `size` en directorios y symlinks: lo que este parser saltaría como cuerpo, tar lo lee como headers.
    if (size !== 0 && !DATA_TYPES.has(type)) throw new AmbiguousTar();
    if (Object.values(TAR_META_TYPE).includes(type)) {
      pending = applyMeta(pending, type, body);
      continue;
    }
    members.push({
      type,
      name: pending.name ?? name,
      linkname: pending.linkname ?? cString(header, 157, 100),
    });
    pending = noMeta;
  }
  throw new CorruptTar();
}

function memberPath(name) {
  return name.replace(/\/+$/, "");
}

function linkStaysInBundle(member) {
  if (member.linkname === "" || path.posix.isAbsolute(member.linkname)) return false;
  return isBundleEntry(path.posix.join(path.posix.dirname(memberPath(member.name)), member.linkname));
}

function goesThroughSymlink(name, symlinkPaths) {
  const segments = memberPath(name).split("/");
  return segments.some((_, index) => index > 0 && symlinkPaths.has(segments.slice(0, index).join("/")));
}

function memberViolation(member, symlinkPaths) {
  if (!isBundleEntry(member.name)) return ` fuera de ${BUNDLE_DIR}/`;
  if (member.type === TAR_TYPE.hardlink) return ": hardlink no permitido";
  if (!EXTRACTABLE_TYPES.has(member.type)) return ": tipo de entrada no permitido";
  if (member.type === TAR_TYPE.symlink && !linkStaysInBundle(member)) return `: symlink fuera de ${BUNDLE_DIR}/`;
  // tar escribiría ese miembro siguiendo el symlink extraído antes; aunque apunte adentro, no hay motivo legítimo.
  if (goesThroughSymlink(member.name, symlinkPaths)) return ": ruta a través de un symlink";
  return null;
}

function parseTar(archive) {
  try {
    return tarMembers(archive);
  } catch (error) {
    if (error instanceof AmbiguousTar) return fail("el tar tiene headers que tar podría leer distinto");
    if (!(error instanceof CorruptTar)) throw error;
    return fail("el tar está corrupto o truncado");
  }
}

function checkTarArchive(archiveFile) {
  const members = parseTar(readArchive(archiveFile));
  if (members.length === 0) fail("el tar no tiene entradas");
  const symlinkPaths = new Set(
    members.filter((member) => member.type === TAR_TYPE.symlink).map((member) => memberPath(member.name)),
  );
  const violations = members.flatMap((member, index) => {
    const violation = memberViolation(member, symlinkPaths);
    return violation === null ? [] : [`entrada ${index + 1} del tar${violation}`];
  });
  if (violations.length > 0) fail(...violations);
}

function bundleRoot(dir) {
  if (!dir) fail("falta la ruta del bundle");
  let stats;
  try {
    stats = lstatSync(dir);
  } catch {
    return fail("el bundle no existe");
  }
  if (!stats.isDirectory()) fail("la raíz del bundle no es un directorio");
  return realpathSync.native(dir);
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

// Next.js copia el .env.production versionado a la función del servidor; solo pasa si todo es NEXT_PUBLIC_.
function nameViolation(entry, full, label) {
  if (entry.isFile() && entry.name === PUBLIC_ENV_FILE) {
    return publicEnvViolations(readFileSync(full, "utf8")).length > 0
      ? [`${label}: .env con claves que no son NEXT_PUBLIC_`]
      : [];
  }
  return isForbiddenName(entry.name) ? [`${label}: nombre de archivo prohibido`] : [];
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function hasSecret(file) {
  const contents = readFileSync(file).toString("latin1");
  return SECRET_PATTERNS.some((pattern) => pattern.test(contents));
}

// El bundle real no trae symlinks colgantes: uno colgante o en ciclo se rechaza en vez de suponerlo inofensivo.
function symlinkViolation(root, full, label) {
  let target;
  try {
    // .native (realpath de libc): la versión JS normaliza "link/.." de forma léxica antes de seguir el link.
    target = realpathSync.native(full);
  } catch {
    return [`${label}: symlink colgante o en ciclo`];
  }
  return isInside(root, target) ? [] : [`${label}: symlink fuera del bundle`];
}

function violationOf(root, dir, entry) {
  const full = path.join(dir, entry.name);
  const label = JSON.stringify(path.relative(root, full));
  if (entry.isDirectory()) return violationsIn(root, full);
  if (!entry.isFile() && !entry.isSymbolicLink()) return [`${label}: tipo de archivo no permitido`];
  const badName = nameViolation(entry, full, label);
  if (badName.length > 0) return badName;
  if (entry.isSymbolicLink()) return symlinkViolation(root, full, label);
  // Un hardlink comparte inodo con un archivo que puede estar fuera del bundle; pnpm no los deja en .open-next.
  if (lstatSync(full).nlink > 1) return [`${label}: hardlink no permitido`];
  return hasSecret(full) ? [`${label}: contenido con patrón de secreto`] : [];
}

function violationsIn(root, dir) {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => violationOf(root, dir, entry));
}

function checkBundle(dir) {
  const root = bundleRoot(dir);
  if (!hasOutputManifest(root)) fail("falta open-next.output.json");
  const violations = violationsIn(root, root);
  if (violations.length > 0) fail(...violations);
}

// No depende del parser del tar: lo que tar haya escrito fuera de .open-next/ queda a la vista.
function checkExtractedRoot(dir) {
  if (!dir) fail("falta la ruta de la extracción");
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return fail("no se pudo leer la extracción");
  }
  if (entries.some((entry) => entry !== BUNDLE_DIR)) fail(`la extracción dejó entradas fuera de ${BUNDLE_DIR}/`);
  checkBundle(path.join(dir, BUNDLE_DIR));
}

const MODES = new Map([
  ["--tar-archive", checkTarArchive],
  ["--extracted-root", checkExtractedRoot],
]);
const mode = MODES.get(process.argv[2]);
if (mode) mode(process.argv[3]);
else checkBundle(process.argv[2]);
