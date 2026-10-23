import { appendFileSync, readFileSync } from "node:fs";
import process from "node:process";

const SHA = /^[0-9a-f]{40}$/;
// Solo un hostname de CloudFront: cualquier otro valor podría colar texto de otros outputs al summary público.
const CLOUDFRONT_DOMAIN = /^[a-z0-9]+\.cloudfront\.net$/;

function fail(message) {
  process.stderr.write(`write-summary: ${message}\n`);
  process.exit(1);
}

function readCloudFrontDomain(outputsFile) {
  let outputs;
  try {
    outputs = JSON.parse(readFileSync(outputsFile ?? "", "utf8"));
  } catch {
    return fail("no se pudo leer el archivo de outputs");
  }
  const domain = outputs?.EvzlaStack?.CloudFrontDomain;
  if (typeof domain !== "string" || !CLOUDFRONT_DOMAIN.test(domain)) {
    return fail("falta EvzlaStack.CloudFrontDomain válido en el archivo de outputs");
  }
  return domain;
}

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (!summaryFile) fail("falta GITHUB_STEP_SUMMARY");
const sha = process.env.DEPLOY_SHA ?? "";
if (!SHA.test(sha)) fail("DEPLOY_SHA no es un SHA de 40 hex");
const domain = readCloudFrontDomain(process.argv[2]);

appendFileSync(summaryFile, `## Deploy de producción\n\n- SHA: \`${sha}\`\n- CloudFront: \`${domain}\`\n`);
