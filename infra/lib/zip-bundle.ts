import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { AssetHashType, FileSystem, Stage, SymlinkFollowMode } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";

// El zipper de la CLI de CDK sigue los symlinks y materializa copias: rompe el layout de pnpm
// (next → node_modules/.pnpm/... encuentra sus dependencias solo como hermanas del destino real).
// `zip -y` guarda los symlinks tal cual y Lambda los restaura al extraer el paquete.
export function symlinkPreservingCode(scope: Construct, dir: string): lambda.Code {
  const hash = FileSystem.fingerprint(dir, { follow: SymlinkFollowMode.NEVER });
  const outdir = Stage.of(scope)?.outdir;
  if (!outdir) throw new Error("No se encontró el outdir del Stage para empaquetar el bundle");
  const zipDir = path.resolve(outdir, "zipped-bundles");
  const zipFile = path.join(zipDir, `${hash}.zip`);
  if (!existsSync(zipFile)) {
    mkdirSync(zipDir, { recursive: true });
    execFileSync("zip", ["-q", "-r", "-y", "-X", zipFile, "."], { cwd: dir });
  }
  return lambda.Code.fromAsset(zipFile, { assetHash: hash, assetHashType: AssetHashType.CUSTOM });
}
