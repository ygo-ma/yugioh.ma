import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createStorage, prefixStorage } from "unstorage";
import type { AppEnv } from "../server/types";
import { BUCKET_NAMES, BUCKETS, type BucketName } from "./buckets";
import type { Buckets, Storage } from "./types";

/**
 * Resolve the Cloudflare storage driver: R2 (requires billing) or KV
 * (free tier, opt-in via `KV_STORAGE=<binding-name>`).
 */
async function resolveCloudflareDriver(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): Promise<Storage> {
  const r2Binding = BUCKETS[bucket].r2Binding(env);
  if (r2Binding) {
    const { default: r2Driver } =
      await import("unstorage/drivers/cloudflare-r2-binding");
    return createStorage({ driver: r2Driver({ binding: r2Binding }) });
  }

  // Opt-in KV mode: KV_STORAGE names the KV binding to use (e.g., "CACHE").
  const kvBindingName = env.KV_STORAGE;
  if (kvBindingName) {
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    const kvBinding = (env as Record<string, unknown>)[kvBindingName] as
      | KVNamespace
      | undefined;
    if (!kvBinding) {
      throw new Error(
        `KV_STORAGE=${kvBindingName} but no binding "${kvBindingName}" exists`,
      );
    }

    const { default: kvDriver } =
      await import("unstorage/drivers/cloudflare-kv-binding");
    return createStorage({
      driver: kvDriver({ binding: kvBinding, base: `storage:${bucket}` }),
    });
  }

  throw new Error(
    "No storage backend: add R2 bindings, or set KV_STORAGE=<binding-name>",
  );
}

async function resolveBucket(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): Promise<Storage> {
  let storage: Storage;

  if (getRuntimeKey() === "workerd") {
    storage = await resolveCloudflareDriver(bucket, env);
  } else if (process.env.S3_ENDPOINT) {
    const { default: s3Driver } = await import("unstorage/drivers/s3");
    storage = createStorage({
      driver: s3Driver({
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? "auto",
        bucket: BUCKETS[bucket].s3BucketName(env),
      }),
    });
  } else {
    const { default: fsDriver } = await import("unstorage/drivers/fs");
    storage = createStorage({
      driver: fsDriver({
        base: `${process.env.STORAGE_DIR ?? "./data/storage"}/${bucket}`,
      }),
    });
  }

  const keyPrefix = env.STORAGE_KEY_PREFIX ?? process.env.STORAGE_KEY_PREFIX;
  if (keyPrefix) {
    storage = prefixStorage(storage, keyPrefix);
  }

  return storage;
}

export async function resolveStorage(
  env: AppEnv["Bindings"],
): Promise<Buckets> {
  const entries = await Promise.all(
    BUCKET_NAMES.map(
      async (name) => [name, await resolveBucket(name, env)] as const,
    ),
  );
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
  return Object.fromEntries(entries) as Buckets;
}

let cachedStorage: Buckets | null = null;
export const storageMiddleware = createMiddleware<AppEnv>(
  async (context, next) => {
    cachedStorage ??= await resolveStorage(context.env);
    context.set("storage", cachedStorage);
    await next();
  },
);
