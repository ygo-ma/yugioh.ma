// Shared storage utilities for domain-specific form handlers (create post,
// update avatar, etc.) that handle file uploads server-side.

import { HTTPException } from "hono/http-exception";
import type { Storage } from "unstorage";
import { v7 as uuidv7 } from "uuid";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileMeta {
  contentType: string;
  size: number;
  originalName: string;
  uploadedAt: number;
}

/** UUID v7 key (time-sortable) with the original file extension preserved. */
export function generateKey(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const rawExt = dot > 0 ? filename.slice(dot) : "";
  const ext = rawExt.replaceAll(/[^a-zA-Z0-9.]/gu, "");
  return `${uuidv7()}${ext}`;
}

/**
 * Validates, stores, and records metadata for a file upload.
 *
 * Returns the storage key (generated or provided via `options.key`).
 * Throws 413 if the file exceeds the size limit.
 */
export async function storeFile(
  storage: Storage,
  file: File,
  options?: { key?: string; maxBytes?: number; meta?: Partial<FileMeta> },
): Promise<{ key: string }> {
  const maxBytes = options?.maxBytes ?? MAX_UPLOAD_BYTES;
  if (file.size > maxBytes) {
    throw new HTTPException(413, { message: "file too large" });
  }

  const key = options?.key ?? generateKey(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await storage.setItemRaw(key, bytes);
  await storage.setMeta(key, {
    contentType: file.type || "application/octet-stream",
    size: file.size,
    originalName: file.name,
    uploadedAt: Date.now(),
    ...options?.meta,
  });

  return { key };
}
