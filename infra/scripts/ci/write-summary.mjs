import { appendFileSync } from "node:fs";
import process from "node:process";
import { cli, SHA } from "./cli.mjs";

// Solo un hostname de CloudFront: cualquier otro valor podría colar texto de otros outputs al summary público.
const CLOUDFRONT_DOMAIN = /^[a-z0-9]+\.cloudfront\.net$/;

const { fail, readFileOrFail } = cli("write-summary");

function readCloudFrontDomain(outputsFile) {
  const outputs = readFileOrFail(outputsFile ?? "", "no se pudo leer el archivo de outputs", (buffer) =>
    JSON.parse(buffer.toString("utf8")),
  );
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
