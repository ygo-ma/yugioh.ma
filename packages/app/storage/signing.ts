/**
 * URL signing for private file access.
 *
 * Two signing mechanisms are supported:
 *
 * - **HMAC** — the app generates a time-limited token and embeds it in a
 *   proxy URL (`/media/<bucket>/<key>?expires=…&token=…`). The media
 *   handler verifies the token before serving bytes. Used when the S3
 *   endpoint is not reachable from the browser (e.g., Docker Compose
 *   with internal MinIO).
 *
 * - **S3 presigning** — the app signs a URL directly against the S3
 *   endpoint using AWS SigV4 (`aws4fetch`). The client downloads from
 *   S3/R2 without going through the app. Used when the S3 endpoint is
 *   publicly reachable (e.g., Cloudflare R2, exposed MinIO, AWS S3).
 *
 * HMAC takes priority when `STORAGE_SIGNING_KEY` is set, so the admin
 * can force the proxy path regardless of whether S3 creds exist.
 */

import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../server/types";
import { BUCKETS, type BucketName } from "./buckets";
import { storageKey, urlFor } from "./url";

/**
 * Computes a URL-safe base64-encoded HMAC-SHA256 signature.
 *
 * Uses the Web Crypto API (`crypto.subtle`) so it works in both
 * Node.js and Cloudflare Workers without platform-specific imports.
 */
async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  // Convert to URL-safe base64 (no padding, +/ replaced with -_)
  return btoa(String.fromCodePoint(...new Uint8Array(sig)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/**
 * Generates an S3-compatible presigned GET URL using AWS SigV4.
 *
 * Returns `null` if S3 credentials are not configured. The `aws4fetch`
 * library is dynamically imported so it's only loaded when needed.
 */
async function s3Presign(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  const endpoint = env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return null;

  const { AwsClient } = await import("aws4fetch");
  const url = new URL(`/${BUCKETS[bucket].s3BucketName(env)}/${key}`, endpoint);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));

  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region: env.S3_REGION ?? "auto",
    service: "s3",
  });
  // signQuery puts the signature in the URL query string (presigned URL)
  // instead of the Authorization header.
  const signed = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

/**
 * Constant-time string comparison for equal-length inputs to prevent
 * timing attacks. Returns early on length mismatch (acceptable for
 * HMAC tokens where the expected length is publicly known).
 */
function timingSafeEqual(expected: string, actual: string): boolean {
  const encoder = new TextEncoder();
  const bufExpected = encoder.encode(expected);
  const bufActual = encoder.encode(actual);
  if (bufExpected.byteLength !== bufActual.byteLength) {
    return false;
  }

  const diff = bufExpected.reduce(
    // oxlint-disable-next-line eslint/no-bitwise -- intentional
    (acc, byte, index) => acc | (byte ^ (bufActual[index] ?? 0)),
    0,
  );

  return diff === 0;
}

/**
 * Verifies an HMAC-signed proxy URL token. Throws 403 if the token is
 * missing, expired, or invalid.
 */
export async function verifyHmacToken(
  bucket: BucketName,
  key: string,
  expires: string | undefined,
  token: string | undefined,
  signingKey: string,
): Promise<void> {
  if (!expires || !token) {
    throw new HTTPException(403, { message: "missing signed URL token" });
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) {
    throw new HTTPException(403, { message: "signed URL has expired" });
  }

  const expected = await hmacSign(`${bucket}:${key}:${expires}`, signingKey);
  if (!timingSafeEqual(expected, token)) {
    throw new HTTPException(403, { message: "invalid signed URL token" });
  }
}

/**
 * Returns the best available URL for accessing a file:
 *
 * 0. **Direct URL** — bucket has a `baseUrl` → return it (no signing
 *    needed, the URL is publicly reachable).
 * 1. **HMAC** — `STORAGE_SIGNING_KEY` set → signed proxy URL.
 * 2. **S3 presigning** — `S3_*` creds set → signed direct URL.
 * 3. **Plain proxy** — public buckets get the proxy path; private
 *    buckets throw 503.
 */
export async function presignUrl(
  bucket: BucketName,
  env: AppEnv["Bindings"],
  key: string,
  ttlSeconds = 300,
): Promise<string> {
  // Direct/S3 URLs need the full prefixed key (bypass proxy → hit bucket).
  // HMAC proxy URLs use the raw key (prefixStorage adds prefix on read).
  const resolved = storageKey(bucket, env, key);

  // If the bucket has a direct URL, use it — the proxy would 404 anyway.
  const directUrl = BUCKETS[bucket].baseUrl(env);
  if (directUrl) {
    return `${directUrl.replace(/\/$/u, "")}/${resolved}`;
  }

  const signingKey = env.STORAGE_SIGNING_KEY;
  if (signingKey) {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const token = await hmacSign(`${bucket}:${key}:${expires}`, signingKey);
    return `/media/${bucket}/${key}?expires=${expires}&token=${token}`;
  }

  const s3Url = await s3Presign(bucket, env, resolved, ttlSeconds);
  if (s3Url) {
    return s3Url;
  }

  if (BUCKETS[bucket].public) {
    return urlFor(bucket, env, key);
  }

  throw new HTTPException(503, {
    message: "private storage access is not configured",
  });
}
