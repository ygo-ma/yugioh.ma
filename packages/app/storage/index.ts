import type { KVNamespace } from "@cloudflare/workers-types";
import { getRuntimeKey } from "hono/adapter";
import { createMiddleware } from "hono/factory";
import { createStorage, prefixStorage } from "unstorage";
import type { AppEnv } from "../server/types";
import { BUCKET_NAMES, BUCKETS, type BucketName } from "./buckets";
import type { Buckets, Storage } from "./types";

export type { Buckets };

// ── URL helpers ─────────────────────────────────────────────────────

function hasS3Creds(env: AppEnv["Bindings"]): boolean {
  return Boolean(
    (env.S3_ENDPOINT ?? process.env.S3_ENDPOINT) &&
    (env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID) &&
    (env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY),
  );
}

/**
 * True when the proxy must refuse to serve because a better access path
 * exists. Public bucket + direct URL → true. S3 creds available (any
 * bucket) → true (use presigned URLs). Otherwise → false.
 */
export function isProxyDisabled(
  bucket: BucketName,
  env: AppEnv["Bindings"],
): boolean {
  if (BUCKETS[bucket].publicUrl(env)) return true;
  if (hasS3Creds(env)) return true;
  return false;
}

/**
 * Returns a stable URL for a file. Public bucket with a direct URL
 * configured → that URL. Otherwise → the backend proxy path.
 */
export function urlFor(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
): string {
  const base = BUCKETS[bucket].publicUrl(env);
  if (base) return `${base.replace(/\/$/u, "")}/${key}`;
  return `/media/${bucket}/${key}`;
}

// ── Presigned URLs ──────────────────────────────────────────────────

/** URL-safe base64 HMAC-SHA256. */
export async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCodePoint(...new Uint8Array(sig)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * Returns the best available URL for accessing a file. Three tiers:
 *
 * 1. **S3 presigning** — `S3_*` creds set → signed URL direct to
 *    R2/S3/MinIO. Worker never proxies bytes.
 * 2. **HMAC app signing** — `STORAGE_SIGNING_KEY` set → signed proxy
 *    URL with expiry. Worker proxies but validates the token.
 * 3. **Plain proxy** — neither set → `/media/<bucket>/<key>` (dev
 *    fallback, no expiry).
 */
export async function presignUrl(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
  ttlSeconds = 300,
): Promise<string> {
  // Tier 1: S3 presigning
  const endpoint = env.S3_ENDPOINT ?? process.env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    env.S3_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  const region = env.S3_REGION ?? process.env.S3_REGION ?? "auto";

  if (endpoint && accessKeyId && secretAccessKey) {
    const { AwsClient } = await import("aws4fetch");
    const bucketName = BUCKETS[bucket].s3BucketName(env);
    const url = new URL(`/${bucketName}/${key}`, endpoint);
    url.searchParams.set("X-Amz-Expires", String(ttlSeconds));
    const client = new AwsClient({
      accessKeyId,
      secretAccessKey,
      region,
      service: "s3",
    });
    const signed = await client.sign(url.toString(), {
      method: "GET",
      aws: { signQuery: true },
    });
    return signed.url;
  }

  // Tier 2: HMAC app-level signing
  const signingKey = env.STORAGE_SIGNING_KEY ?? process.env.STORAGE_SIGNING_KEY;
  if (signingKey) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = await hmacSign(`${bucket}:${key}:${expires}`, signingKey);
    return `/media/${bucket}/${key}?expires=${expires}&token=${token}`;
  }

  // Tier 3: plain proxy URL (dev fallback)
  return urlFor(bucket, env, key);
}

// ── Driver resolution ───────────────────────────────────────────────

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
