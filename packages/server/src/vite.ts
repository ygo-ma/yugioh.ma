import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NitroEventHandler } from "nitro/types";
import { nitro, type NitroPluginConfig } from "nitro/vite";
import { normalizePath, type PluginOption } from "vite";

type AcmeApp = string | { route: string; src: string };

interface AcmeServerOptions {
  baseDir?: string;
  apps?: AcmeApp[];
  middlewareDir?: string;
  nitro?: NitroPluginConfig;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  cloudflareExternals?: string[];
}

function readPackageJson(dir: string): PackageJson | undefined {
  try {
    return JSON.parse(
      readFileSync(resolve(dir, "package.json"), "utf-8"),
    ) as PackageJson;
  } catch {
    return undefined;
  }
}

function collectExternals(root: string): string[] {
  const pkg = readPackageJson(root);
  if (!pkg) {
    return [];
  }

  const ownExternals = pkg.cloudflareExternals ?? [];
  const depsExternals = Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  }).flatMap((dep) => {
    const depPkg = readPackageJson(resolve(root, "node_modules", dep));
    return depPkg?.cloudflareExternals ?? [];
  });

  return [...ownExternals, ...depsExternals];
}

function middleware(handler: string): NitroEventHandler {
  return { route: "", handler: normalizePath(handler), middleware: true };
}

function normalizeApp(entry: AcmeApp) {
  if (typeof entry === "string") {
    return { route: `/${entry}`, src: `${entry}/app` };
  }
  return entry;
}

function scanMiddlewareDir(dir: string): NitroEventHandler[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .toSorted()
    .map((file) => middleware(resolve(dir, file)));
}

function buildAppVirtual(baseDir: string, entry: AcmeApp) {
  const { route, src } = normalizeApp(entry);
  const id = `#acme${route.replaceAll("/", "-")}`;
  const appImportPath = normalizePath(resolve(baseDir, src));
  const source = [
    `import { createApiEventHandler } from "@acme/server";`,
    `import app from "${appImportPath}";`,
    `export default createApiEventHandler(app);`,
  ].join("\n");
  const handler: NitroEventHandler = {
    route: `${route}/**`,
    handler: id,
    lazy: true,
  };
  return { id, source, handler };
}

type ExternalOption = NonNullable<
  NonNullable<NitroPluginConfig["rolldownConfig"]>["external"]
>;

function mergeExternal(
  own: string[],
  user: ExternalOption | undefined,
): ExternalOption {
  if (typeof user === "function") {
    return (id, parentId, isResolved) => {
      return own.includes(id) || user(id, parentId, isResolved);
    };
  }

  const userList = Array.isArray(user) ? user : user ? [user] : [];
  return [...own, ...userList];
}

export function acmeServer(options: AcmeServerOptions = {}): PluginOption {
  const isCf = process.env.NITRO_PRESET?.startsWith("cloudflare") ?? false;
  const pkg = import.meta.dirname;
  const root = process.cwd();

  const virtual: Record<string, string> = {};
  const handlers: NitroEventHandler[] = [
    middleware(resolve(pkg, "nitro/middleware/env")),
    middleware(resolve(pkg, "nitro/middleware/sentry")),
  ];

  const baseDir = resolve(root, options.baseDir ?? "./");

  if (options.middlewareDir) {
    handlers.push(
      ...scanMiddlewareDir(resolve(baseDir, options.middlewareDir)),
    );
  }

  for (const entry of options.apps ?? []) {
    const { id, source, handler } = buildAppVirtual(baseDir, entry);
    virtual[id] = source;
    handlers.push(handler);
  }

  const {
    virtual: userVirtual,
    handlers: userHandlers = [],
    rolldownConfig: userRolldownConfig = {},
    ...restNitroOptions
  } = options.nitro ?? {};
  const { external: userExternal, ...restRolldownConfig } = userRolldownConfig;
  const external = isCf ? collectExternals(root) : [];

  return nitro({
    serverDir: false,
    errorHandler: resolve(pkg, "nitro/error"),
    ...restNitroOptions,
    virtual: { ...virtual, ...userVirtual },
    handlers: [...handlers, ...userHandlers],
    rolldownConfig: {
      ...restRolldownConfig,
      external: mergeExternal(external, userExternal),
    },
  });
}
