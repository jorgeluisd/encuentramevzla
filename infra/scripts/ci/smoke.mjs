import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { URL, fileURLToPath } from "node:url";
import { cli } from "./cli.mjs";

// fetch nativo de Node 22: no hay módulo node:* que lo exporte y el preset ESLint no declara globals de Node.
const { fetch, AbortSignal } = globalThis;

const { fail } = cli("smoke");

const ATTEMPTS = 5;
const STABLE_TITLE = "<title>EncuéntrameVzla —";
const ADMIN_LOGIN_PATH = "/admin/login";
const SERVICES_TEXT = "Ayuda gratuita tras el sismo";

function millisecondsFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function baseUrlFrom(arg) {
  let url;
  try {
    url = new URL(arg ?? "");
  } catch {
    return undefined;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url : undefined;
}

function pageContaining(text, missingReason) {
  return async (response) => {
    if (response.status !== 200) {
      await response.body?.cancel();
      return { ok: false };
    }
    const body = await response.text();
    return body.includes(text) ? { ok: true } : { ok: false, reason: missingReason };
  };
}

const checkHome = pageContaining(STABLE_TITLE, "título ausente");
// `/` sale de la caché de CloudFront; /servicios es force-dynamic y se renderiza en la Lambda desplegada.
const checkServices = pageContaining(SERVICES_TEXT, "texto ausente");

async function checkNotFound(response) {
  await response.body?.cancel();
  return { ok: response.status === 404 };
}

async function checkAdmin(response, url) {
  await response.body?.cancel();
  if (response.status < 300 || response.status > 399) return { ok: false };
  const location = response.headers.get("location");
  const target = location ? new URL(location, url) : undefined;
  const isTeamLogin = target?.origin === url.origin && target.pathname === ADMIN_LOGIN_PATH;
  return isTeamLogin ? { ok: true } : { ok: false, reason: "redirección inesperada" };
}

// Nunca el buscador ni /api: el smoke no debe dejar filas en search_log ni mandar correos.
const CHECKS = {
  "/": checkHome,
  "/admin": checkAdmin,
  "/servicios": checkServices,
  "/__smoke-no-existe": checkNotFound,
};
export const SMOKE_PATHS = Object.keys(CHECKS);

async function attempt(baseUrl, smokePath, timeoutMs) {
  const url = new URL(smokePath, baseUrl);
  try {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { status: String(response.status), ...(await CHECKS[smokePath](response, url)) };
  } catch {
    return { status: "sin-respuesta", ok: false };
  }
}

async function smokePathWithRetries(baseUrl, smokePath, { retryDelayMs, timeoutMs }) {
  for (let n = 1; n <= ATTEMPTS; n += 1) {
    const result = await attempt(baseUrl, smokePath, timeoutMs);
    if (result.ok) return true;
    const reason = result.reason ? `: ${result.reason}` : "";
    process.stderr.write(`smoke: ${smokePath} ${result.status} intento ${n}/${ATTEMPTS}${reason}\n`);
    if (n < ATTEMPTS) await sleep(retryDelayMs);
  }
  return false;
}

async function main() {
  const baseUrl = baseUrlFrom(process.argv[2]);
  if (!baseUrl) fail("falta la URL base http(s) del sitio");
  const options = {
    retryDelayMs: millisecondsFromEnv("SMOKE_RETRY_DELAY_MS", 10_000),
    timeoutMs: millisecondsFromEnv("SMOKE_REQUEST_TIMEOUT_MS", 10_000),
  };
  for (const smokePath of SMOKE_PATHS) {
    if (!(await smokePathWithRetries(baseUrl, smokePath, options))) process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
