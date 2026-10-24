import { lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const BUNDLE_DIR = ".open-next";

// Los patrones se arman por partes para que este archivo no case con el escaneo de secretos del repo.
const SECRET_PATTERNS = [
  new RegExp("AKIA" + "[0-9A-Z]{16}"),
  new RegExp("aws_secret_access" + "_key" + "\\s*[=:]\\s*[\"']?[A-Za-z0-9/+]{40}"),
  new RegExp("-----BEGIN " + "[^\\n]*" + "PRIVATE KEY" + "-----"),
];

const TAR_BLOCK = 512;
const TAR_TYPE = { file: "0", oldFile: "\0", hardlink: "1", symlink: "2", directory: "5" };
const TAR_META_TYPE = { longName: "L", longLink: "K", pax: "x" };
const EXTRACTABLE_TYPES = new Set([TAR_TYPE.file, TAR_TYPE.oldFile, TAR_TYPE.symlink, TAR_TYPE.directory]);

class CorruptTar extends Error {}

function fail(messages) {
  for (const message of messages) process.stderr.write(`check-bundle: ${message}\n`);
  process.exit(1);
}

function isBundleEntry(entry) {
  const segments = entry.split("/").filter((segment) => segment !== "");
  return (
    !entry.startsWith("/") &&
    segments[0] === BUNDLE_DIR &&
    segments.every((segment) => segment !== ".." && segment !== ".")
  );
}

function readArchive(archiveFile) {
  if (!archiveFile) fail(["falta la ruta del tar"]);
  try {
    return gunzipSync(readFileSync(archiveFile));
  } catch {
    return fail(["no se pudo leer el tar"]);
  }
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

function paxRecords(body) {
  const records = {};
  let offset = 0;
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset);
    const length = Number(body.subarray(offset, space).toString("utf8"));
    const end = offset + length;
    if (space === -1 || !Number.isInteger(length) || length <= 0 || end > body.length || body[end - 1] !== 0x0a) {
      throw new CorruptTar();
    }
    const record = body.subarray(space + 1, end - 1).toString("utf8");
    const separator = record.indexOf("=");
    if (separator === -1) throw new CorruptTar();
    records[record.slice(0, separator)] = record.slice(separator + 1);
    offset = end;
  }
  return records;
}

function headerName(header) {
  const name = cString(header, 0, 100);
  const prefix = cString(header, 345, 155);
  return prefix ? `${prefix}/${name}` : name;
}

function applyMeta(pending, type, body) {
  if (type === TAR_META_TYPE.longName) return { ...pending, name: cString(body, 0, body.length) };
  if (type === TAR_META_TYPE.longLink) return { ...pending, linkname: cString(body, 0, body.length) };
  const records = paxRecords(body);
  return { name: records.path ?? pending.name, linkname: records.linkpath ?? pending.linkname };
}

// Se leen los headers del tar en vez de parsear `tar -tv`: ese texto es ambiguo con nombres que contienen
// " -> " o " link to ", depende del locale y difiere entre GNU tar y bsdtar.
function tarMembers(archive) {
  const members = [];
  let pending = {};
  let offset = 0;
  while (offset + TAR_BLOCK <= archive.length) {
    const header = archive.subarray(offset, offset + TAR_BLOCK);
    if (header.every((byte) => byte === 0)) return members;
    if (!hasValidChecksum(header)) throw new CorruptTar();
    const size = octal(header, 124, 12);
    const bodyStart = offset + TAR_BLOCK;
    if (bodyStart + size > archive.length) throw new CorruptTar();
    const body = archive.subarray(bodyStart, bodyStart + size);
    offset = bodyStart + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
    const type = String.fromCharCode(header[156] ?? 0);
    if (Object.values(TAR_META_TYPE).includes(type)) {
      pending = applyMeta(pending, type, body);
      continue;
    }
    members.push({
      type,
      name: pending.name ?? headerName(header),
      linkname: pending.linkname ?? cString(header, 157, 100),
    });
    pending = {};
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
    if (!(error instanceof CorruptTar)) throw error;
    return fail(["el tar está corrupto o truncado"]);
  }
}

function checkTarArchive(archiveFile) {
  const members = parseTar(readArchive(archiveFile));
  if (members.length === 0) fail(["el tar no tiene entradas"]);
  const symlinkPaths = new Set(
    members.filter((member) => member.type === TAR_TYPE.symlink).map((member) => memberPath(member.name)),
  );
  const violations = members.flatMap((member, index) => {
    const violation = memberViolation(member, symlinkPaths);
    return violation === null ? [] : [`entrada ${index + 1} del tar${violation}`];
  });
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
  if (isForbiddenName(entry.name)) return [`${label}: nombre de archivo prohibido`];
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
  if (!hasOutputManifest(root)) fail(["falta open-next.output.json"]);
  const violations = violationsIn(root, root);
  if (violations.length > 0) fail(violations);
}

if (process.argv[2] === "--tar-archive") checkTarArchive(process.argv[3]);
else checkBundle(process.argv[2]);
