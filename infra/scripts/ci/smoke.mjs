import { readFile } from "node:fs/promises";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { URL, fileURLToPath } from "node:url";
import { cli } from "./cli.mjs";

// fetch nativo de Node 22: no hay módulo node:* que lo exporte y el preset ESLint no declara globals de Node.
const { fetch, AbortSignal } = globalThis;

const { fail } = cli("smoke");

const ATTEMPTS = 5;
// La invalidación de CloudFront tarda 1-2 min en propagarse: ~3 min de reintentos solo mientras sirve el build viejo.
// Presupuesto aparte del de los demás fallos: un 503 en frío tras esa espera conserva sus 5 intentos.
const STALE_BUILD_ATTEMPTS = 18;
const STALE_BUILD = "build id distinto";
// accept está en la clave de caché de ServerCachePolicy: el smoke debe leer la variante que reciben los navegadores.
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const BUILD_ID = /^[A-Za-z0-9_-]{1,64}$/;
// En el payload RSC el build id va escapado dentro de un string de JS: \"b\":\"<id>\".
const SERVED_BUILD_ID = /\\?"b\\?":\\?"([A-Za-z0-9_-]{1,64})\\?"/;
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

async function readBuildId(file) {
  try {
    const buildId = (await readFile(file, "utf8")).trim();
    return BUILD_ID.test(buildId) ? buildId : undefined;
  } catch {
    return undefined;
  }
}

function containing(text, missingReason) {
  return (body) => (body.includes(text) ? undefined : missingReason);
}

function servingBuild(expectedBuildId) {
  return (body) => {
    const served = SERVED_BUILD_ID.exec(body)?.[1];
    if (served === undefined) return "build id ausente";
    return served === expectedBuildId ? undefined : STALE_BUILD;
  };
}

function pageWhere(...problems) {
  return async (response) => {
    if (response.status !== 200) {
      await response.body?.cancel();
      return { ok: false };
    }
    const body = await response.text();
    const reason = problems.map((problem) => problem(body)).find((found) => found !== undefined);
    return reason === undefined ? { ok: true } : { ok: false, reason };
  };
}

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

const htmlPage = (buildId, ...problems) => ({
  headers: { accept: BROWSER_ACCEPT },
  check: pageWhere(...problems, servingBuild(buildId)),
});
const probe = (check) => ({ headers: {}, check });

// Nunca /api ni el buscador con término: el smoke no debe dejar filas en search_log ni mandar correos.
// `/` sale de la caché de CloudFront; /servicios es force-dynamic y se renderiza en la Lambda desplegada.
// /buscar no entra: es un redirect 307 a la home, sin HTML que comparar.
function checksFor(buildId) {
  return {
    "/": htmlPage(buildId, containing(STABLE_TITLE, "título ausente")),
    "/confianza": htmlPage(buildId),
    "/emergencias": htmlPage(buildId),
    "/admin": probe(checkAdmin),
    "/servicios": probe(pageWhere(containing(SERVICES_TEXT, "texto ausente"))),
    "/__smoke-no-existe": probe(checkNotFound),
  };
}
export const SMOKE_PATHS = Object.keys(checksFor(""));

async function attempt(baseUrl, smokePath, { headers, check }, timeoutMs) {
  const url = new URL(smokePath, baseUrl);
  try {
    const response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    return { status: String(response.status), ...(await check(response, url)) };
  } catch {
    return { status: "sin-respuesta", ok: false };
  }
}

async function smokePathWithRetries(baseUrl, smokePath, smokeCheck, { retryDelayMs, timeoutMs }) {
  const failures = { stale: 0, other: 0 };
  for (;;) {
    const result = await attempt(baseUrl, smokePath, smokeCheck, timeoutMs);
    if (result.ok) return true;
    const budget = result.reason === STALE_BUILD ? "stale" : "other";
    const attempts = budget === "stale" ? STALE_BUILD_ATTEMPTS : ATTEMPTS;
    failures[budget] += 1;
    const reason = result.reason ? `: ${result.reason}` : "";
    process.stderr.write(`smoke: ${smokePath} ${result.status} intento ${failures[budget]}/${attempts}${reason}\n`);
    if (failures[budget] >= attempts) return false;
    await sleep(retryDelayMs);
  }
}

async function main() {
  const baseUrl = baseUrlFrom(process.argv[2]);
  if (!baseUrl) fail("falta la URL base http(s) del sitio");
  const buildId = await readBuildId(process.argv[3] ?? "");
  if (!buildId) fail("falta un BUILD_ID válido del build desplegado");
  const options = {
    retryDelayMs: millisecondsFromEnv("SMOKE_RETRY_DELAY_MS", 10_000),
    timeoutMs: millisecondsFromEnv("SMOKE_REQUEST_TIMEOUT_MS", 10_000),
  };
  for (const [smokePath, smokeCheck] of Object.entries(checksFor(buildId))) {
    if (!(await smokePathWithRetries(baseUrl, smokePath, smokeCheck, options))) process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
