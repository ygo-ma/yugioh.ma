import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../db/types";
import { hasDirectPublicUrl, urlFor } from "../storage";
import { BUCKETS, type BucketName } from "../storage/buckets";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileMeta {
  contentType: string;
  size: number;
  originalName: string;
  uploadedAt: string;
}

export const metaKey = (key: string) => `meta:${key}`;

export const sanitize = (name: string) => {
  const safe = name.replaceAll(/[^a-zA-Z0-9._-]/gu, "_").replace(/^\.+/u, "");
  const suffix = Math.random().toString(16).slice(2, 10);
  const dot = safe.lastIndexOf(".");
  return dot > 0
    ? `${safe.slice(0, dot)}-${suffix}${safe.slice(dot)}`
    : `${safe || "file"}-${suffix}`;
};

function buildGetHandler(bucket: BucketName) {
  return async (context: Context<AppEnv, "/:key">) => {
    // Public buckets with a configured direct URL must be served from that
    // URL — never from this proxy. Hard-disable here so there's never two
    // ways to read the same public file.
    if (hasDirectPublicUrl(bucket, context.env)) {
      throw new HTTPException(404, {
        message: "this bucket is served from a direct public URL",
      });
    }

    const key = context.req.param("key");
    const storage = context.var.storage[bucket];
    const data = await storage.getItemRaw<Uint8Array>(key);
    if (!data) throw new HTTPException(404, { message: "file not found" });

    const meta = await storage.getItem<FileMeta>(metaKey(key));
    const headers = new Headers({
      "Content-Type": meta?.contentType ?? "application/octet-stream",
      "Content-Length": String(data.byteLength),
    });
    // Public dev-fallback path: filenames carry a random suffix so files
    // are effectively immutable — safe to cache aggressively at the edge
    // even if a misconfigured prod ever lands here.
    if (BUCKETS[bucket].public) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    }
    return new Response(new Uint8Array(data), { status: 200, headers });
  };
}

function buildPostHandler(bucket: BucketName) {
  return async (context: Context<AppEnv>) => {
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "missing 'file' field" });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new HTTPException(413, { message: "file too large" });
    }

    const key = sanitize(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const storage = context.var.storage[bucket];
    await storage.setItemRaw(key, bytes);
    await storage.setItem(metaKey(key), {
      contentType: file.type || "application/octet-stream",
      size: file.size,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    } satisfies FileMeta);

    return context.json(
      {
        bucket,
        key,
        size: file.size,
        type: file.type,
        url: urlFor(bucket, context.env, key),
      },
      201,
    );
  };
}

function buildDeleteHandler(bucket: BucketName) {
  return async (context: Context<AppEnv, "/:key">) => {
    const key = context.req.param("key");
    const storage = context.var.storage[bucket];
    await storage.removeItem(key);
    await storage.removeItem(metaKey(key));
    return context.body(null, 204);
  };
}

/**
 * Builds a Hono sub-router that exposes `GET/POST/DELETE` against a single
 * named bucket. Each top-level bucket route file (e.g. `assets.ts`) calls
 * this with its own bucket name; per-bucket customization (different size
 * caps, MIME validation, etc.) belongs in the route file, not here.
 */
export function createFilesRouter(bucket: BucketName) {
  return new Hono<AppEnv>()
    .get("/:key", buildGetHandler(bucket))
    .post("/", buildPostHandler(bucket))
    .delete("/:key", buildDeleteHandler(bucket));
}
