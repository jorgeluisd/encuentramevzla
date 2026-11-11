// Prueba C1 (ADR-0012): build real de Next con el interceptor, proxy que compara
// x-amz-content-sha256 con el SHA-256 de los bytes recibidos y un "S3" en otro origen.
// El proxy solo registra booleanos: nunca guarda ni imprime bodies ni hashes.
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, request } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";

const FIXTURE_DIR = fileURLToPath(new URL("./fixture/", import.meta.url));
const NEXT_BIN = createRequire(import.meta.url).resolve("next/dist/bin/next");
const HOST = "127.0.0.1";
const HASH_HEADER = "x-amz-content-sha256";
const BROWSERS = { chromium, webkit, firefox };
const UPLOAD_BYTES = randomBytes(70_000);
const UPLOAD_NAME = "Ñandú Pérez 🌎";
const children = new Set();

function contentTypeKind(value) {
  if (!value) return "none";
  if (value.startsWith("text/plain")) return "text/plain";
  if (value.startsWith("multipart/form-data")) return "multipart/form-data";
  return "other";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, HOST, () => resolve(server.address().port)));
}

function createVerifyingProxy(targetPort, records) {
  return createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.method !== "GET" && req.method !== "HEAD") {
      const sent = req.headers[HASH_HEADER];
      records.push({
        method: req.method,
        path: new URL(req.url, "http://proxy").pathname,
        contentType: contentTypeKind(req.headers["content-type"]),
        headerPresent: typeof sent === "string",
        matches: sent === createHash("sha256").update(body).digest("hex"),
      });
    }
    const upstream = request(
      { host: HOST, port: targetPort, method: req.method, path: req.url, headers: req.headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    upstream.end(body);
  });
}

function createFakeS3(records) {
  return createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "PUT");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    await readBody(req);
    records.push({
      method: req.method,
      headerPresent: HASH_HEADER in req.headers,
      contentTypePreserved: req.headers["content-type"] === "image/png",
    });
    res.writeHead(200);
    res.end();
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} → exit ${code}`))));
  });
}

async function startNext(port) {
  const child = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(port), "-H", HOST], {
    cwd: FIXTURE_DIR,
    stdio: ["ignore", "pipe", "inherit"],
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  await new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Ready")) resolve();
    });
    child.on("exit", (code) => reject(new Error(`next start → exit ${code}`)));
  });
  return child;
}

function freePort() {
  const probe = createServer();
  return listen(probe).then((port) => new Promise((resolve) => probe.close(() => resolve(port))));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function summarize(records) {
  return records.map(({ method, path, contentType, headerPresent, matches }) =>
    `${method} ${path} ${contentType} header=${headerPresent} match=${matches}`,
  );
}

function expectSignedPosts(records, contentType, count) {
  const posts = records.filter((r) => r.method === "POST");
  assert(posts.length === count, `se esperaban ${count} POST, hubo: ${summarize(records).join("; ")}`);
  for (const post of posts) {
    assert(post.contentType === contentType, `content-type ${post.contentType}, se esperaba ${contentType}`);
    assert(post.headerPresent && post.matches, `POST sin header o sin coincidencia: ${summarize([post])}`);
  }
}

async function waitForQuiet(ms = 1_000) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function scenarios({ proxyUrl, s3Url, proxyRecords, s3Records, seenContentTypes }) {
  const pageUrl = `${proxyUrl}/?s3=${encodeURIComponent(s3Url)}`;
  const reset = () => {
    proxyRecords.length = 0;
    s3Records.length = 0;
  };
  const hydratedPage = async (browser) => {
    const page = await (await browser.newContext()).newPage();
    await page.goto(pageUrl);
    for (const id of ["string-submit", "upload-submit", "put-submit", "concurrent-submit"]) {
      await page.locator(`#${id}`).waitFor();
      await page.waitForFunction((sel) => !document.querySelector(sel)?.disabled, `#${id}`);
    }
    reset();
    return page;
  };
  const record = (records) => {
    for (const r of records) if (r.method === "POST") seenContentTypes.add(r.contentType);
  };

  return {
    "S1 HTML sin JS trae disabled (AC-10)": async (browser) => {
      const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
      await page.goto(pageUrl);
      const states = await page.locator("button[type=submit]").evaluateAll((buttons) => buttons.map((b) => b.disabled));
      assert(states.length === 4 && states.every(Boolean), `botones sin disabled: ${JSON.stringify(states)}`);
      await page.context().close();
    },
    "S2 sin JS, Enter no envía (AC-12)": async (browser) => {
      const page = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
      await page.goto(pageUrl);
      reset();
      await page.locator("#upload-name").press("Enter");
      await waitForQuiet();
      assert(proxyRecords.length === 0, `hubo envíos sin JS: ${summarize(proxyRecords).join("; ")}`);
      await page.context().close();
    },
    "S3 con JS se habilita y la acción string coincide (AC-11, AC-9)": async (browser) => {
      const page = await hydratedPage(browser);
      await page.click("#string-submit");
      await page.locator("#string-result", { hasText: "25" }).waitFor();
      expectSignedPosts(proxyRecords, "text/plain", 1);
      record(proxyRecords);
      await page.context().close();
    },
    "S4 multipart coincide y llega el tamaño correcto (AC-9)": async (browser) => {
      const page = await hydratedPage(browser);
      await page.locator("#upload-file").setInputFiles({
        name: "binario.bin",
        mimeType: "application/octet-stream",
        buffer: UPLOAD_BYTES,
      });
      await page.click("#upload-submit");
      await page.locator("#upload-result", { hasText: "|" }).waitFor();
      const shown = await page.locator("#upload-result").textContent();
      assert(shown === `${UPLOAD_NAME}|${UPLOAD_BYTES.length}`, "la acción no recibió el nombre o el tamaño esperado");
      expectSignedPosts(proxyRecords, "multipart/form-data", 1);
      record(proxyRecords);
      await page.context().close();
    },
    "S5 PUT a otro origen sin header y con Content-Type original (AC-5)": async (browser) => {
      const page = await hydratedPage(browser);
      await page.click("#put-submit");
      await page.locator("#put-result", { hasText: "200" }).waitFor();
      const puts = s3Records.filter((r) => r.method === "PUT");
      assert(puts.length === 1, `se esperaba 1 PUT en el segundo origen, hubo ${puts.length}`);
      assert(!puts[0].headerPresent, "el PUT al segundo origen llevó x-amz-content-sha256");
      assert(puts[0].contentTypePreserved, "el PUT al segundo origen cambió su Content-Type");
      assert(proxyRecords.length === 0, `el PUT pasó por el origen propio: ${summarize(proxyRecords).join("; ")}`);
      await page.context().close();
    },
    "S6 acciones concurrentes coinciden (AC-6)": async (browser) => {
      const page = await hydratedPage(browser);
      await page.click("#concurrent-submit");
      await page.locator("#concurrent-result", { hasText: "16,49"}).waitFor();
      expectSignedPosts(proxyRecords, "text/plain", 2);
      record(proxyRecords);
      await page.context().close();
    },
  };
}

async function main() {
  const browserNames = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(BROWSERS);
  if (!process.env.SKIP_BUILD) await run(process.execPath, [NEXT_BIN, "build"], { cwd: FIXTURE_DIR });

  const proxyRecords = [];
  const s3Records = [];
  const seenContentTypes = new Set();
  const nextPort = await freePort();
  await startNext(nextPort);
  const proxy = createVerifyingProxy(nextPort, proxyRecords);
  const s3 = createFakeS3(s3Records);
  const proxyUrl = `http://${HOST}:${await listen(proxy)}`;
  const s3Url = `http://${HOST}:${await listen(s3)}`;
  await (await fetch(`${proxyUrl}/`)).arrayBuffer();
  const suite = scenarios({ proxyUrl, s3Url, proxyRecords, s3Records, seenContentTypes });

  let failures = 0;
  try {
    for (const name of browserNames) {
      const browser = await BROWSERS[name].launch();
      try {
        for (const [scenario, check] of Object.entries(suite)) {
          try {
            await check(browser);
            console.log(`PASS ${name} · ${scenario}`);
          } catch (error) {
            failures += 1;
            console.log(`FAIL ${name} · ${scenario} → ${error.message.split("\n")[0]}`);
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    proxy.close();
    s3.close();
    for (const child of children) child.kill("SIGTERM");
  }

  for (const required of ["text/plain", "multipart/form-data"]) {
    if (!seenContentTypes.has(required)) {
      failures += 1;
      console.log(`FAIL no se vio ningún POST ${required} firmado`);
    }
  }
  console.log(failures === 0 ? "content-hash C1: PASS" : `content-hash C1: FAIL (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
}

process.on("exit", () => {
  for (const child of children) child.kill("SIGTERM");
});

await main();
