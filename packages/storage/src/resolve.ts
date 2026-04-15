import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createStorage, prefixStorage } from "unstorage";
import type { BucketConfig, BucketMap, Storage, StorageEnvVars } from "./types";

/** R2 binding — Cloudflare Workers only, requires billing. */
async function tryR2<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
): Promise<Storage | undefined> {
  if (getRuntimeKey() !== "workerd") {
    return undefined;
  }

  const binding = config.r2Binding(env);
  if (!binding) {
    return undefined;
  }

  const { default: r2Driver } =
    await import("unstorage/drivers/cloudflare-r2-binding");
  const driver = r2Driver({ binding });
  return createStorage({ driver });
}

/** KV fallback — Cloudflare Workers only, free tier. */
async function tryKV(
  bucket: string,
  env: StorageEnvVars,
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
  const driver = kvDriver({ binding: kvBinding, base: `storage:${bucket}` });
  return createStorage({ driver });
}

/** S3-compatible storage — any runtime. */
async function tryS3<TEnv extends StorageEnvVars>(
  config: BucketConfig<TEnv>,
  env: TEnv,
): Promise<Storage | undefined> {
  const endpoint = env.S3_ENDPOINT;
  if (!endpoint) {
    return undefined;
  }

  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ENDPOINT is set but S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is missing",
    );
  }

  const { default: s3Driver } = await import("unstorage/drivers/s3");
  const driver = s3Driver({
    accessKeyId,
    secretAccessKey,
    endpoint,
    region: env.S3_REGION ?? "auto",
    bucket: config.s3BucketName(env),
  });
  return createStorage({ driver });
}

/** Local filesystem — Node.js only. */
async function tryFS(bucket: string): Promise<Storage | undefined> {
  if (getRuntimeKey() === "workerd") {
    return undefined;
  }

  const { default: fsDriver } = await import("unstorage/drivers/fs");
  const driver = fsDriver({
    base: `${process.env.STORAGE_DIR ?? "./data/storage"}/${bucket}`,
  });
  return createStorage({ driver });
}

async function resolveBucket<TEnv extends StorageEnvVars>(
  config: BucketConfig<TEnv>,
  bucket: string,
  env: TEnv,
): Promise<Storage> {
  const storage =
    (await tryR2(config, env)) ??
    (await tryKV(bucket, env)) ??
    (await tryS3(config, env)) ??
    (await tryFS(bucket));

  if (!storage) {
    throw new Error(
      "No storage backend: add R2 bindings, set S3_ENDPOINT, or set KV_STORAGE=<binding-name>",
    );
  }

  const keyPrefix = config.keyPrefix(env);
  return keyPrefix ? prefixStorage(storage, keyPrefix) : storage;
}

export function createResolvers<
  TEnv extends StorageEnvVars,
  TBucket extends string,
>(bucketConfig: BucketMap<TEnv, TBucket>) {
  async function resolveStorage(env: TEnv): Promise<Record<TBucket, Storage>> {
    const entries = await Promise.all(
      Object.entries<BucketConfig<TEnv>>(bucketConfig).map(
        async ([name, config]) => {
          const storage = await resolveBucket(config, name, env);
          return [name, storage] as const;
        },
      ),
    );
    return Object.fromEntries(entries) as Record<TBucket, Storage>;
  }

  return { resolveStorage };
}
