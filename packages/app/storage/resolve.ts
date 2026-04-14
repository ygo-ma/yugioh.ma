import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createStorage, prefixStorage } from "unstorage";
import type { AppEnv } from "../server/types";
import { BUCKET_NAMES, BUCKETS, type BucketName } from "./buckets";
import type { Buckets, Storage } from "./types";

type Env = AppEnv["Bindings"];

/** R2 binding — Cloudflare Workers only, requires billing. */
async function tryR2(
  bucket: BucketName,
  env: Env,
): Promise<Storage | undefined> {
  if (getRuntimeKey() !== "workerd") {
    return undefined;
  }

  const binding = BUCKETS[bucket].r2Binding(env);
  if (!binding) return undefined;

  const { default: r2Driver } =
    await import("unstorage/drivers/cloudflare-r2-binding");
  return createStorage({ driver: r2Driver({ binding }) });
}

/** KV fallback — Cloudflare Workers only, free tier. */
async function tryKV(
  bucket: BucketName,
  env: Env,
): Promise<Storage | undefined> {
  if (getRuntimeKey() !== "workerd") {
    return undefined;
  }

  const kvBindingName = env.KV_STORAGE;
  if (!kvBindingName) {
    return undefined;
  }

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

/** S3-compatible storage — any runtime. */
async function tryS3(
  bucket: BucketName,
  env: Env,
): Promise<Storage | undefined> {
  const endpoint = env.S3_ENDPOINT;
  if (!endpoint) return undefined;

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ENDPOINT is set but S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is missing",
    );
  }

  const { default: s3Driver } = await import("unstorage/drivers/s3");
  return createStorage({
    driver: s3Driver({
      accessKeyId,
      secretAccessKey,
      endpoint,
      region: env.S3_REGION ?? "auto",
      bucket: BUCKETS[bucket].s3BucketName(env),
    }),
  });
}

/** Local filesystem — Node.js only. */
async function tryFS(bucket: BucketName): Promise<Storage | undefined> {
  if (getRuntimeKey() === "workerd") return undefined;

  const { default: fsDriver } = await import("unstorage/drivers/fs");
  return createStorage({
    driver: fsDriver({
      base: `${process.env.STORAGE_DIR ?? "./data/storage"}/${bucket}`,
    }),
  });
}

/**
 * Resolves the storage driver for a bucket. Tries each backend in
 * priority order — the first one that's configured wins:
 *
 * 1. **R2 binding** — Cloudflare Workers only, requires billing.
 * 2. **KV fallback** — Cloudflare Workers only, free tier via `KV_STORAGE`.
 * 3. **S3** — any runtime, when `S3_ENDPOINT` is set.
 * 4. **Filesystem** — Node.js only, local dev default.
 */
async function resolveBucket(bucket: BucketName, env: Env): Promise<Storage> {
  const storage =
    (await tryR2(bucket, env)) ??
    (await tryKV(bucket, env)) ??
    (await tryS3(bucket, env)) ??
    (await tryFS(bucket));

  if (!storage) {
    throw new Error(
      "No storage backend: add R2 bindings, set S3_ENDPOINT, or set KV_STORAGE=<binding-name>",
    );
  }

  const keyPrefix = BUCKETS[bucket].keyPrefix(env);
  if (keyPrefix) {
    return prefixStorage(storage, keyPrefix);
  }

  return storage;
}

export async function resolveStorage(env: Env): Promise<Buckets> {
  const entries = await Promise.all(
    BUCKET_NAMES.map(
      async (name) => [name, await resolveBucket(name, env)] as const,
    ),
  );
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
