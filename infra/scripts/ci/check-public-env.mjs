import process from "node:process";
import { cli, publicEnvViolations } from "./cli.mjs";

const { fail, readFileOrFail } = cli("check-public-env");

function readEnvFile(envFile) {
  if (!envFile) fail("falta la ruta del archivo");
  return readFileOrFail(envFile, "no se pudo leer el archivo");
}

const violations = publicEnvViolations(readEnvFile(process.argv[2]));
if (violations.length > 0) fail(...violations);
