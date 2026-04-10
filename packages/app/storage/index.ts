import type { KVNamespace, R2Bucket } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createStorage, prefixStorage } from "unstorage";
import type { AppEnv } from "../db/types";
import type { BucketName } from "./buckets";
import type { Buckets, Storage } from "./types";

export type { Buckets };

/**
 * Reads `STORAGE_<BUCKET>_PUBLIC_URL` from the Cloudflare bindings or
 * `process.env`. The Record literal is exhaustive over `BucketName` so
 * adding a new public bucket is a compile-time push to extend it.
 */
function readPublicUrlEnv(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): string | undefined {
  const urls: Record<BucketName, string | undefined> = {
    public: env.STORAGE_PUBLIC_URL ?? process.env.STORAGE_PUBLIC_URL,
    private: undefined, // private bucket — no public URL by definition
  };
  return urls[bucket];
}

/**
 * True iff the bucket is public AND has a configured direct URL. The proxy
 * GET handler uses this to hard-disable itself when a canonical direct URL
 * exists — there must never be two ways to read a public file.
 */
export function hasDirectPublicUrl(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): boolean {
  return readPublicUrlEnv(bucket, env) !== undefined;
}

/**
 * Returns the URL the client should use for a given file. Public bucket
 * with `STORAGE_<BUCKET>_PUBLIC_URL` set → direct R2/S3 URL. Otherwise →
 * the backend proxy path (the dev fallback for public buckets, and the
 * only path for private buckets).
 */
export function urlFor(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
): string {
  const base = readPublicUrlEnv(bucket, env);
  if (base) return `${base.replace(/\/$/u, "")}/${key}`;
  return `/media/${bucket}/${key}`;
}

/** Per-bucket R2 binding lookup. Exhaustive over `BucketName`. */
function r2BindingFor(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): R2Bucket | undefined {
  const bindings: Record<BucketName, R2Bucket | undefined> = {
    public: env.STORAGE_PUBLIC,
    private: env.STORAGE_PRIVATE,
  };
  return bindings[bucket];
}

/** Per-bucket S3 bucket name. Exhaustive over `BucketName`. */
function s3BucketNameFor(bucket: BucketName): string {
  const bucketNames: Record<BucketName, string> = {
    public: process.env.S3_BUCKET_PUBLIC ?? "acme-public",
    private: process.env.S3_BUCKET_PRIVATE ?? "acme-private",
  };
  return bucketNames[bucket];
}

/**
 * Resolve the Cloudflare storage driver: R2 (requires billing) or KV
 * (free tier, opt-in via `KV_STORAGE=<binding-name>`).
 */
async function resolveCloudflareDriver(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): Promise<Storage> {
  const r2Binding = r2BindingFor(bucket, env);
  if (r2Binding) {
    const { default: r2Driver } =
      await import("unstorage/drivers/cloudflare-r2-binding");
    return createStorage({ driver: r2Driver({ binding: r2Binding }) });
  }

  // Opt-in KV mode: KV_STORAGE names the KV binding to use (e.g., "CACHE").
  // CI sets this for preview environments where R2 billing may not be enabled.
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
  const kvBindingName = (env as Record<string, unknown>).KV_STORAGE as
    | string
    | undefined;
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
        bucket: s3BucketNameFor(bucket),
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

  // In preview environments, each branch's objects are namespaced under a
  // key prefix so multiple PRs can share the same physical bucket.
  const keyPrefix = env.STORAGE_KEY_PREFIX ?? process.env.STORAGE_KEY_PREFIX;
  if (keyPrefix) {
    storage = prefixStorage(storage, keyPrefix);
  }

  return storage;
}

export async function resolveStorage(
  env: AppEnv["Bindings"],
): Promise<Buckets> {
  // Building this object literally (rather than reducing over BUCKETS) keeps
  // the result type narrow without any cast — the compiler verifies every
  // BucketName key is present. Adding a bucket is a compile-time push.
  const [publicBucket, privateBucket] = await Promise.all([
    resolveBucket("public", env),
    resolveBucket("private", env),
  ]);
  return { public: publicBucket, private: privateBucket };
}

let cachedStorage: Buckets | null = null;
export const storageMiddleware = createMiddleware<AppEnv>(
  async (context, next) => {
    cachedStorage ??= await resolveStorage(context.env);
    context.set("storage", cachedStorage);
    await next();
  },
);
