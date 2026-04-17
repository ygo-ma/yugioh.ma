// Storage abstraction shared by every backend (R2, KV, S3, fs). The interface
// is deliberately tiny: get/put/delete/has. Drivers stream bodies in and out;
// metadata travels alongside as a flat string map plus dedicated content-type
// and cache-control fields so each backend can store them natively.

export interface StorageObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** Stored HTTP cache-control. Absent when the put did not set it. */
  cacheControl: string | undefined;
  /** Byte length of `body`. Null when the backend doesn't expose it. */
  size: number | null;
  metadata: Record<string, string>;
}

/** Driver-construction options shared by every backend. */
export interface DriverOptions {
  /** Used when a put() omits cacheControl. Driver writes it to its native
   *  http-metadata field so direct/presigned access serves it too. */
  defaultCacheControl?: string;
}

export interface StoragePutOptions {
  contentType: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  /**
   * Expected byte length of the body. Drivers verify the actual byte count
   * matches and abort the put on mismatch. Untrusted callers (e.g. raw
   * Content-Length headers) are safe to pass — verification is enforced.
   */
  sizeHint?: number;
}

export interface StorageDriver {
  get(key: string): Promise<StorageObject | null>;
  put(
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: StoragePutOptions,
  ): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

/**
 * Wraps a driver to prepend a `${prefix}:` to every key. Used for CI branch
 * isolation so multiple branches can share a single bucket without colliding.
 */
export function prefixDriver(
  inner: StorageDriver,
  prefix: string,
): StorageDriver {
  const prefixed = (key: string) => `${prefix}:${key}`;

  return {
    get: (key) => inner.get(prefixed(key)),
    put: (key, body, options) => inner.put(prefixed(key), body, options),
    delete: (key) => inner.delete(prefixed(key)),
    has: (key) => inner.has(prefixed(key)),
  };
}

/** Public/private bucket → standard Cache-Control string. */
export function cacheControlFor(isPublic: boolean): string {
  return isPublic ? "public, max-age=31536000, immutable" : "private, no-store";
}

/**
 * Drains a stream into a Uint8Array. Used by drivers whose backends do not
 * accept streaming put bodies (KV, FS) so the public API stays uniform.
 */
export async function bufferBody(
  body: ReadableStream<Uint8Array> | Uint8Array,
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) {
    return body;
  }
  return new Uint8Array(await new Response(body).arrayBuffer());
}

/**
 * Returns the body wrapped in a counting transform that errors when the
 * actual byte count differs from `sizeHint`. Stream errors mid-transfer
 * propagate to the underlying put, which is atomic for R2/S3/KV — so a
 * mismatch leaves no object behind. FS handles atomicity via tmp + rename.
 *
 * If no hint is given, the body passes through unchanged.
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
