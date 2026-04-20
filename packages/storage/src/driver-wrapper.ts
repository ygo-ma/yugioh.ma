import type {
  StorageDriver,
  StorageObject,
  StorageObjectHead,
  StoragePutOptions,
} from "./driver";
import { StorageError, type StorageOp } from "./error";

// Hard cap on storage keys. Matches S3's spec'd 1024-char object-key
// limit; tightest bound that holds across R2 and S3.
const KEY_MAX_LENGTH = 1024;

/**
 * Wraps a `StorageDriver` with cross-cutting concerns at the call boundary:
 * key length validation and uniform `StorageError` rewrapping.
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
    if (key.length > KEY_MAX_LENGTH) {
      const message =
        `${this.name} ${op}: ` +
        `key length ${key.length} exceeds ${KEY_MAX_LENGTH}`;
      throw new StorageError({ driver: this.name, op, key }, message);
    }

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
