import { HTTPException } from "hono/http-exception";
import type { BucketMap, S3Credentials, S3Fn, SigningKeyFn } from "./types";

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
  return btoa(String.fromCodePoint(...new Uint8Array(sig)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

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

/** Generates an S3-compatible presigned GET URL using AWS SigV4. Returns null if S3 creds are missing. */
async function s3Presign(
  s3BucketName: string,
  creds: S3Credentials | undefined,
  key: string,
  ttlSeconds: number,
): Promise<string | null> {
  if (!creds) {
    return null;
  }

  const { AwsClient } = await import("aws4fetch");
  const url = new URL(`/${s3BucketName}/${key}`, creds.endpoint);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));

  const client = new AwsClient({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region: creds.region ?? "auto",
    service: "s3",
  });
  const signed = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function verifyHmacToken(
  bucket: string,
  key: string,
  expires: string | undefined,
  token: string | undefined,
  signingKey: string,
): Promise<void> {
  if (!expires || !token) {
    throw new HTTPException(403, {
      message: "missing signed URL token",
    });
  }

  const expiresAt = Number(expires);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) {
    throw new HTTPException(403, {
      message: "signed URL has expired",
    });
  }

  const expected = await hmacSign(`${bucket}:${key}:${expires}`, signingKey);
  if (!timingSafeEqual(expected, token)) {
    throw new HTTPException(403, {
      message: "invalid signed URL token",
    });
  }
}

interface UrlUtils<TEnv, TBucket> {
  storageKey: (bucket: TBucket, env: TEnv, key: string) => string;
  urlFor: (bucket: TBucket, env: TEnv, key: string) => string;
}

export function createPresignUrl<TEnv, TBucket extends string>(
  bucketConfig: BucketMap<TEnv, TBucket>,
  url: UrlUtils<TEnv, TBucket>,
  signingKey: SigningKeyFn<TEnv>,
  s3: S3Fn<TEnv>,
) {
  return async function presignUrl(
    bucket: TBucket,
    env: TEnv,
    key: string,
    ttlSeconds = 300,
  ): Promise<string> {
    const resolved = url.storageKey(bucket, env, key);

    const directUrl = bucketConfig[bucket].baseUrl(env);
    if (directUrl) {
      return `${directUrl.replace(/\/$/u, "")}/${resolved}`;
    }

    const sigKey = signingKey(env);
    if (sigKey) {
      const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
      const token = await hmacSign(`${bucket}:${key}:${expires}`, sigKey);
      return `/media/${bucket}/${key}?expires=${expires}&token=${token}`;
    }

    const s3Creds = s3(env);
    const s3Url = await s3Presign(
      bucketConfig[bucket].s3BucketName(env),
      s3Creds,
      resolved,
      ttlSeconds,
    );
    if (s3Url) {
      return s3Url;
    }

    if (bucketConfig[bucket].public) {
      return url.urlFor(bucket, env, key);
    }

    throw new HTTPException(503, {
      message: "private storage access is not configured",
    });
  };
}
