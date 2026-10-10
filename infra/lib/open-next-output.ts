import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type OpenNextBehavior = {
  pattern: string;
  origin?: string;
};

type FunctionOrigin = {
  type: "function";
  handler: string;
  bundle: string;
  streaming?: boolean;
};

type BundleRef = { handler: string; bundle: string };

type OpenNextOutputFile = {
  origins: {
    s3: { originPath: string; copy: { from: string; to: string; cached: boolean; versionedSubDir?: string }[] };
    imageOptimizer: FunctionOrigin;
    default: FunctionOrigin | { type: "ecs" };
  } & Record<string, unknown>;
  behaviors: OpenNextBehavior[];
  edgeFunctions: Record<string, unknown>;
  additionalProps?: {
    initializationFunction?: BundleRef;
    revalidationFunction?: BundleRef;
  };
};

export type OpenNextBundle = { dir: string; handler: string };

export type OpenNextOutput = {
  server: OpenNextBundle & { streaming: boolean };
  image: OpenNextBundle;
  revalidation: OpenNextBundle;
  initialization?: OpenNextBundle & { cacheFile: string };
  assetsDir: string;
  cacheDir?: string;
  behaviors: OpenNextBehavior[];
};

const OUTPUT_FILE = "open-next.output.json";

// Las rutas del json son relativas al padre de .open-next (p. ej. ".open-next/assets").
export function readOpenNextOutput(openNextDir: string): OpenNextOutput {
  const file = path.join(openNextDir, OUTPUT_FILE);
  if (!existsSync(file)) {
    throw new Error(
      `No existe ${file}. Corre \`pnpm --filter @evzla/web build:aws\` o pasa -c openNextPath=<dir>.`,
    );
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as OpenNextOutputFile;
  const root = path.dirname(openNextDir);
  const resolve = (rel: string) => path.join(root, rel);

  const server = raw.origins.default;
  if (server.type !== "function") {
    throw new Error("Solo se soporta el origen default como Lambda (no ECS).");
  }
  if (Object.keys(raw.edgeFunctions ?? {}).length > 0) {
    throw new Error("Middleware externo / edge functions no soportados por este stack.");
  }
  const extraOrigins = Object.keys(raw.origins).filter(
    (o) => !["s3", "imageOptimizer", "default"].includes(o),
  );
  if (extraOrigins.length > 0) {
    throw new Error(`Orígenes adicionales no soportados: ${extraOrigins.join(", ")}`);
  }
  const revalidation = raw.additionalProps?.revalidationFunction;
  if (!revalidation) {
    throw new Error("Falta revalidationFunction en la salida de OpenNext.");
  }

  const assets = raw.origins.s3.copy.find((c) => c.cached);
  const cache = raw.origins.s3.copy.find((c) => !c.cached);
  if (!assets) throw new Error("Falta la copia de assets en la salida de OpenNext.");

  const init = raw.additionalProps?.initializationFunction;

  return {
    server: { dir: resolve(server.bundle), handler: server.handler, streaming: server.streaming ?? false },
    image: { dir: resolve(raw.origins.imageOptimizer.bundle), handler: raw.origins.imageOptimizer.handler },
    revalidation: { dir: resolve(revalidation.bundle), handler: revalidation.handler },
    initialization: init
      ? {
          dir: resolve(init.bundle),
          handler: init.handler,
          cacheFile: path.join(resolve(init.bundle), "dynamodb-cache.json"),
        }
      : undefined,
    assetsDir: resolve(assets.from),
    cacheDir: cache ? resolve(cache.from) : undefined,
    behaviors: raw.behaviors,
  };
}
