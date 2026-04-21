import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import {
  cacheControlFor,
  prefixDriver,
  type DriverOptions,
  type StorageDriver,
} from "./driver";
import { KvDriver } from "./drivers/kv";
import { R2Driver } from "./drivers/r2";
import { S3Driver } from "./drivers/s3";
import { DriverWrapper } from "./driver-wrapper";
import type {
  BucketConfig,
  BucketMap,
  KvBindingNameFn,
  S3Credentials,
  S3Fn,
  UserEnv,
} from "./types";

/**
 * R2 binding. Cloudflare Workers only, requires billing.
 */
function tryR2<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
  driverOptions: DriverOptions,
): StorageDriver | undefined {
  if (getRuntimeKey() !== "workerd") {
    return undefined;
  }

  const binding = config.r2Binding(env);
  if (!binding) {
    return undefined;
  }

  return new R2Driver(binding, driverOptions);
}

/**
 * KV fallback. Cloudflare Workers only, free tier.
 */
function tryKV(
  bucket: string,
  kvBindingName: string | undefined,
  env: UserEnv,
  driverOptions: DriverOptions,
): StorageDriver | undefined {
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

  // KvDriver is bucket-agnostic; namespace per-bucket so multiple buckets
  // can share a single KV namespace without colliding.
  return prefixDriver(
    new KvDriver(kvBinding, driverOptions),
    `storage:${bucket}`,
  );
}

/**
 * S3-compatible storage. Works in any runtime.
 */
function tryS3<TEnv>(
  config: BucketConfig<TEnv>,
  env: TEnv,
  creds: S3Credentials | undefined,
  driverOptions: DriverOptions,
): StorageDriver | undefined {
  if (!creds) {
    return undefined;
  }

  return new S3Driver(creds, config.s3BucketName(env), driverOptions);
}

/**
 * Local filesystem driver. Node.js only.
 *
 * Dynamic import keeps `node:fs` out of the Cloudflare bundle (paired
 * with `cloudflareExternals` in package.json).
 */
async function tryFS(
  bucket: string,
  driverOptions: DriverOptions,
): Promise<StorageDriver | undefined> {
  if (getRuntimeKey() === "workerd") {
    return undefined;
  }

  const { FsDriver } = await import("@acme/storage/drivers/fs");
  const root = process.env.STORAGE_DIR ?? "./data/storage";
  return new FsDriver(`${root}/${bucket}`, driverOptions);
}

async function resolveBucket<TEnv>(
  config: BucketConfig<TEnv>,
  bucket: string,
  env: TEnv,
  s3Creds: S3Credentials | undefined,
  kvBindingName: string | undefined,
): Promise<StorageDriver> {
  const driverOptions: DriverOptions = {
    defaultCacheControl: cacheControlFor(config.public),
  };

  const driver =
    tryR2(config, env, driverOptions) ??
    tryKV(bucket, kvBindingName, env, driverOptions) ??
    tryS3(config, env, s3Creds, driverOptions) ??
    (await tryFS(bucket, driverOptions));

  if (!driver) {
    throw new Error(
      "No storage backend: configure an R2 binding, provide S3 credentials via s3(), or a KV binding name via kvBindingName()",
    );
  }

  const keyPrefix = config.keyPrefix(env);
  const prefixed = keyPrefix ? prefixDriver(driver, keyPrefix) : driver;

  // Wrap last so emitted StorageError.key is the user-supplied key,
  // not the backend-prefixed one.
  return new DriverWrapper(prefixed);
}

export function createResolveStorage<TEnv, TBucket extends string>(
  bucketConfig: BucketMap<TEnv, TBucket>,
  s3: S3Fn<TEnv>,
  kvBindingName: KvBindingNameFn<TEnv>,
) {
  async function resolveStorage(
    env: TEnv,
  ): Promise<Record<TBucket, StorageDriver>> {
    const s3Creds = s3(env);
    const kvName = kvBindingName(env);
    const entries = await Promise.all(
      Object.entries<BucketConfig<TEnv>>(bucketConfig).map(
        async ([name, config]) => {
          const driver = await resolveBucket(
            config,
            name,
            env,
            s3Creds,
            kvName,
          );
          return [name, driver] as const;
        },
      ),
    );
    return Object.fromEntries(entries) as Record<TBucket, StorageDriver>;
  }

  return resolveStorage;
}
