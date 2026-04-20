// Shared storage utilities for domain-specific form handlers (create post,
// update avatar, etc.) that handle file uploads server-side.

import { HTTPException } from "hono/http-exception";
import { v7 as uuidv7 } from "uuid";
import type { StorageDriver } from "./driver";
import type { ValidatedMetadata } from "./metadata-keys";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

function matchContentType(type: string, pattern: string): boolean {
  if (pattern.endsWith("/*")) {
    return type.startsWith(pattern.slice(0, -1));
  }
  return type === pattern;
}

/**
 * UUID v7 key (time-sortable) with the original file extension preserved.
 */
export function generateKey(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const rawExt = dot > 0 ? filename.slice(dot) : "";
  const ext = rawExt.replaceAll(/[^a-zA-Z0-9.]/gu, "");
  return `${uuidv7()}${ext}`;
}

export interface StoreFileOptions<
  TMeta extends Record<string, string> = Record<string, string>,
> {
  key?: string;
  maxBytes?: number;
  allowedTypes?: string[];
  /**
   * Same kebab-case contract as `StoragePutOptions.metadata`.
   */
  metadata?: ValidatedMetadata<TMeta>;
}

/**
 * Validates and stores a file upload. Streams the body through to the driver
 * with sizeHint = file.size so the driver can verify byte count without
 * buffering the whole file in memory.
 *
 * Returns the storage key (generated or provided via `key`).
 * Throws 415 if the file type is not allowed.
 * Throws 413 if the file exceeds the size limit.
 */
export async function storeFile<TMeta extends Record<string, string>>(
  storage: StorageDriver,
  file: File,
  options: StoreFileOptions<TMeta> = {},
): Promise<{ key: string }> {
  const {
    key,
    maxBytes = MAX_UPLOAD_BYTES,
    allowedTypes,
    metadata = {},
  } = options;

  if (allowedTypes?.every((pattern) => !matchContentType(file.type, pattern))) {
    throw new HTTPException(415, { message: "unsupported file type" });
  }

  if (file.size > maxBytes) {
    throw new HTTPException(413, { message: "file too large" });
  }

  const resolvedKey = key ?? generateKey(file.name);
  await storage.put(resolvedKey, file.stream(), {
    contentType: file.type || "application/octet-stream",
    sizeHint: file.size,
    metadata: {
      "original-name": file.name,
      "uploaded-at": String(Date.now()),
      ...metadata,
    },
  });

  return { key: resolvedKey };
}
