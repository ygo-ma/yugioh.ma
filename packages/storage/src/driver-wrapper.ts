import type {
  StorageDriver,
  StorageObject,
  StorageObjectHead,
  StoragePutOptions,
} from "./driver";
import { StorageError, type StorageOp } from "./error";

// Hard cap on storage keys, in UTF-8 bytes (S3's spec is bytes, not
// chars). Tightest bound that holds across R2 and S3.
const KEY_MAX_BYTES = 1024;
const encoder = new TextEncoder();

// Matches keys containing "." or ".." as a /-delimited segment.
// Standalone dots in segment middle (e.g. ".htaccess", "foo.bar")
// pass through.
const TRAVERSAL_SEGMENT_RE = /(?:^|\/)\.{1,2}(?:$|\/)/u;

/**
 * Wraps a `StorageDriver` with cross-cutting concerns at the call boundary:
 * write-side key validation (length, traversal segments) and uniform
 * `StorageError` rewrapping.
 *
 * Reads `name` from the wrapped driver. Inner `StorageError` throws pass
 * through unchanged to avoid double-wrapping.
 */
export class DriverWrapper implements StorageDriver {
  readonly name: string;

  constructor(private readonly inner: StorageDriver) {
    this.name = inner.name;
  }

  async get(key: string): Promise<StorageObject | null> {
    return this.#wrap("get", key, () => this.inner.get(key));
  }

  async head(key: string): Promise<StorageObjectHead | null> {
    return this.#wrap("head", key, () => this.inner.head(key));
  }

  async put<TMeta extends Record<string, string>>(
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: StoragePutOptions<TMeta>,
  ): Promise<void> {
    const byteLength = encoder.encode(key).byteLength;
    if (byteLength > KEY_MAX_BYTES) {
      const message =
        `${this.name} put: ` +
        `key is ${byteLength} bytes, exceeds ${KEY_MAX_BYTES}`;
      throw new StorageError({ driver: this.name, op: "put", key }, message);
    }

    if (TRAVERSAL_SEGMENT_RE.test(key)) {
      const message =
        `${this.name} put: ` +
        `key contains "." or ".." segment: ${JSON.stringify(key)}`;
      throw new StorageError({ driver: this.name, op: "put", key }, message);
    }

    return this.#wrap("put", key, () => this.inner.put(key, body, options));
  }

  async delete(key: string): Promise<void> {
    return this.#wrap("delete", key, () => this.inner.delete(key));
  }

  async has(key: string): Promise<boolean> {
    return this.#wrap("has", key, () => this.inner.has(key));
  }

  async #wrap<TResult>(
    op: StorageOp,
    key: string,
    fn: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await fn();
    } catch (cause) {
      if (cause instanceof StorageError) {
        throw cause;
      }

      throw new StorageError({ driver: this.name, op, key, cause });
    }
  }
}
