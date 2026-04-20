// Storage abstraction shared by every backend (R2, KV, S3, fs). The interface
// is deliberately tiny: get/head/put/delete/has. Drivers stream bodies in and
// out; metadata travels alongside as a flat string map plus dedicated
// content-type and cache-control fields so each backend can store them
// natively.

import type { ValidatedMetadata } from "./metadata-keys";

export interface StorageObjectHead {
  contentType: string;
  /**
   * Stored HTTP cache-control. Absent when the put did not set it.
   */
  cacheControl: string | undefined;
  /**
   * Byte length of the stored object. Null when the backend doesn't expose it.
   */
  size: number | null;
  /**
   * Custom metadata. Keys are HTTP-header-style: lowercase letters,
   * digits, and `-`, starting with a letter or digit. S3 case-folds
   * `x-amz-meta-*` headers in transit, so we enforce the contract on
   * write across every backend (see `validateMetadataKeys`).
   */
  metadata: Record<string, string>;
}

export interface StorageObject extends StorageObjectHead {
  body: ReadableStream<Uint8Array>;
}

/**
 * Driver-construction options shared by every backend.
 */
export interface DriverOptions {
  /**
   * Used when a put() omits cacheControl. Driver writes it to its
   * native http-metadata field so direct/presigned access serves it.
   */
  defaultCacheControl?: string;
}

export interface StoragePutOptions<
  TMeta extends Record<string, string> = Record<string, string>,
> {
  contentType: string;
  cacheControl?: string;
  /**
   * Custom metadata. Keys must match `/^[a-z0-9][a-z0-9-]*$/`.
   *
   * Literal keys are checked at compile time via `ValidatedMetadata`;
   * dynamic keys are caught at runtime by `validateMetadataKeys`.
   *
   * S3 case-folds `x-amz-meta-*` headers in transit, so this contract
   * holds across every backend.
   */
  metadata?: ValidatedMetadata<TMeta>;
  /**
   * Expected byte length of the body. Drivers verify the actual byte
   * count matches and abort the put on mismatch.
   *
   * Untrusted callers (raw Content-Length headers) are safe to pass:
   * verification is enforced.
   */
  sizeHint?: number;
}

export interface StorageDriver {
  readonly name: string;
  get(key: string): Promise<StorageObject | null>;
  head(key: string): Promise<StorageObjectHead | null>;
  put<TMeta extends Record<string, string>>(
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: StoragePutOptions<TMeta>,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Character used by `prefixDriver` to join prefix and key.
 * ASCII Unit Separator (U+001F) absent from any
 * real-world key (filenames, URLs...).
 */
export const KEY_SEPARATOR = "\u001F";

/**
 * Wraps a driver to prepend `${prefix}${KEY_SEPARATOR}` to every key.
 * Used for CI branch isolation so multiple branches can share a single
 * bucket without colliding.
 */
export function prefixDriver(
  inner: StorageDriver,
  prefix: string,
): StorageDriver {
  if (prefix.includes(KEY_SEPARATOR)) {
    const message = `invalid prefix: contains reserved separator U+001F (${prefix})`;
    throw new Error(message);
  }

  const prefixed = (key: string) => `${prefix}${KEY_SEPARATOR}${key}`;

  return {
    name: inner.name,
    get: (key) => inner.get(prefixed(key)),
    head: (key) => inner.head(prefixed(key)),
    async put<TMeta extends Record<string, string>>(
      key: string,
      body: ReadableStream<Uint8Array> | Uint8Array,
      options: StoragePutOptions<TMeta>,
    ): Promise<void> {
      await inner.put(prefixed(key), body, options);
    },
    delete: (key) => inner.delete(prefixed(key)),
    has: (key) => inner.has(prefixed(key)),
  };
}

/**
 * Public/private bucket -> standard Cache-Control string.
 */
export function cacheControlFor(isPublic: boolean): string {
  return isPublic ? "public, max-age=31536000, immutable" : "private, no-store";
}

/**
 * Drains a stream into a Uint8Array. Aborts when the running total exceeds
 * `maxBytes` so an unbounded source can't OOM the worker before the
 * backend rejects it. Required - no safe default for an open buffer.
 */
export async function bufferBody(
  body: ReadableStream<Uint8Array> | Uint8Array,
  maxBytes: number,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    if (body.byteLength > maxBytes) {
      const message = `body exceeds ${maxBytes} bytes (got ${body.byteLength})`;
      throw new Error(message);
    }
    return body;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  // for-await-of cancels the source on throw - no explicit cancel needed.
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      const message = `body exceeds ${maxBytes} bytes`;
      throw new Error(message);
    }

    chunks.push(chunk);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/**
 * Wraps the body in a counting transform that errors if the byte count
 * differs from `sizeHint`. If no hint is given, body passes through.
 *
 * Stream errors mid-transfer propagate to the underlying put. R2/S3/KV
 * puts are atomic; FS handles atomicity via tmp + rename.
 */
export function validatingStream(
  body: ReadableStream<Uint8Array> | Uint8Array,
  sizeHint: number | undefined,
): ReadableStream<Uint8Array> | Uint8Array {
  if (sizeHint === undefined) {
    return body;
  }

  if (body instanceof Uint8Array) {
    const byteLength = body.byteLength;
    if (byteLength !== sizeHint) {
      const message = `size mismatch: hint=${sizeHint} actual=${byteLength}`;
      throw new Error(message);
    }

    return body;
  }

  let count = 0;
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      count += chunk.byteLength;

      if (count > sizeHint) {
        const message = `size mismatch: hint=${sizeHint} exceeded by stream`;
        controller.error(new Error(message));
        return;
      }

      controller.enqueue(chunk);
    },
    flush(controller) {
      if (count !== sizeHint) {
        const message = `size mismatch: hint=${sizeHint} actual=${count}`;
        controller.error(new Error(message));
      }
    },
  });

  return body.pipeThrough(transform);
}
