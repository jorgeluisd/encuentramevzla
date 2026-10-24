import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isDanglingSymlink(target: string): boolean {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

// Lo que no existe se resuelve desde su ancestro existente más cercano; un symlink colgante no se resuelve.
function realTarget(target: string): string | undefined {
  try {
    return realpathSync.native(target);
  } catch (error) {
    const parent = path.dirname(target);
    if (!isMissing(error) || isDanglingSymlink(target) || parent === target) return undefined;
    const realParent = realTarget(parent);
    return realParent === undefined ? undefined : path.join(realParent, path.basename(target));
  }
}

function isStrictlyInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

// El json lo produce el job que corre código de terceros: una ruta fuera de .open-next llevaría al synth
// a zipear o publicar cualquier archivo del runner. El mensaje nombra el campo, nunca la ruta.
function confineTo(openNextDir: string) {
  const lexicalRoot = path.resolve(openNextDir);
  const realRoot = realpathSync.native(openNextDir);
  const isConfined = (target: string): boolean => {
    const real = realTarget(target);
    return isStrictlyInside(lexicalRoot, path.resolve(target)) && real !== undefined && isStrictlyInside(realRoot, real);
  };
  return (field: string, target: string): string => {
    if (!isConfined(target)) throw new Error(`La salida de OpenNext apunta fuera de .open-next (${field}).`);
    return target;
  };
}

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
  const confine = confineTo(openNextDir);
  const resolve = (field: string, rel: string) => confine(field, path.join(root, rel));

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
  const initDir = init ? resolve("additionalProps.initializationFunction.bundle", init.bundle) : undefined;

  return {
    server: {
      dir: resolve("origins.default.bundle", server.bundle),
      handler: server.handler,
      streaming: server.streaming ?? false,
    },
    image: {
      dir: resolve("origins.imageOptimizer.bundle", raw.origins.imageOptimizer.bundle),
      handler: raw.origins.imageOptimizer.handler,
    },
    revalidation: {
      dir: resolve("additionalProps.revalidationFunction.bundle", revalidation.bundle),
      handler: revalidation.handler,
    },
    initialization:
      init && initDir
        ? {
            dir: initDir,
            handler: init.handler,
            cacheFile: confine("dynamodb-cache.json", path.join(initDir, "dynamodb-cache.json")),
          }
        : undefined,
    assetsDir: resolve("origins.s3.copy (assets)", assets.from),
    cacheDir: cache ? resolve("origins.s3.copy (cache)", cache.from) : undefined,
    behaviors: raw.behaviors,
  };
}
