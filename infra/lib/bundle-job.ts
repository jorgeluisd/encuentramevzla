import path from "node:path";
import { DockerImage } from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { buildSync } from "esbuild";

// Bundling local con la API de esbuild: NodejsFunction exige el lockfile bajo projectRoot y en el
// monorepo vive en la raíz. El SDK v3 lo trae el runtime de Lambda.
export function bundleJob(entry: string): lambda.Code {
  return lambda.Code.fromAsset(path.dirname(entry), {
    bundling: {
      image: DockerImage.fromRegistry("unused-local-bundling-only"),
      local: {
        tryBundle(outputDir) {
          buildSync({
            entryPoints: [entry],
            outfile: path.join(outputDir, "index.mjs"),
            bundle: true,
            platform: "node",
            target: "node22",
            format: "esm",
            minify: true,
            external: ["@aws-sdk/*"],
            logLevel: "error",
          });
          return true;
        },
      },
    },
  });
}
