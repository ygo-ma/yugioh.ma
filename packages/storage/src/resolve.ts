import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createStorage, prefixStorage } from "unstorage";
import type {
  BucketConfig,
  BucketMap,
  S3Credentials,
  KvBindingNameFn,
  S3Fn,
  Storage,
  UserEnv,
} from "./types";

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
  kvBindingName: string | undefined,
  env: UserEnv,
): Promise<Storage | undefined> {
  if (getRuntimeKey() !== "workerd" || !kvBindingName) {
    return undefined;
  }

  const kvBinding = (env as Record<string, unknown>)[kvBindingName] as
    | KVNamespace
    | undefined;
  if (!kvBinding) {
    throw new Error(
      `kvBindingName="${kvBindingName}" but no binding "${kvBindingName}" exists`,
    );
  }

  const { default: kvDriver } =
    await import("unstorage/drivers/cloudflare-kv-binding");
  const driver = kvDriver({
    binding: kvBinding,
    base: `storage:${bucket}`,
  });
  return createStorage({ driver });
}

/** S3-compatible storage — any runtime. */
async function tryS3<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
  creds: S3Credentials | undefined,
): Promise<Storage | undefined> {
  if (!creds) {
    return undefined;
  }

  const { default: s3Driver } = await import("unstorage/drivers/s3");
  const driver = s3Driver({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    endpoint: creds.endpoint,
    region: creds.region ?? "auto",
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

async function resolveBucket<TEnv>(
  config: BucketConfig<TEnv>,
  bucket: string,
  env: TEnv,
  s3Creds: S3Credentials | undefined,
  kvBindingName: string | undefined,
): Promise<Storage> {
  const storage =
    (await tryR2(config, env)) ??
    (await tryKV(bucket, kvBindingName, env)) ??
    (await tryS3(config, env, s3Creds)) ??
    (await tryFS(bucket));

  if (!storage) {
    throw new Error(
      "No storage backend: configure an R2 binding, provide S3 credentials via s3(), or a KV binding name via kvBindingName()",
    );
  }

  const keyPrefix = config.keyPrefix(env);
  return keyPrefix ? prefixStorage(storage, keyPrefix) : storage;
}

export function createResolveStorage<TEnv, TBucket extends string>(
  bucketConfig: BucketMap<TEnv, TBucket>,
  s3: S3Fn<TEnv>,
  kvBindingName: KvBindingNameFn<TEnv>,
) {
  async function resolveStorage(env: TEnv): Promise<Record<TBucket, Storage>> {
    const s3Creds = s3(env);
    const kvName = kvBindingName(env);
    const entries = await Promise.all(
      Object.entries<BucketConfig<TEnv>>(bucketConfig).map(
        async ([name, config]) => {
          const storage = await resolveBucket(
            config,
            name,
            env,
            s3Creds,
            kvName,
          );
          return [name, storage] as const;
        },
      ),
    );
    return Object.fromEntries(entries) as Record<TBucket, Storage>;
  }

  return resolveStorage;
}
