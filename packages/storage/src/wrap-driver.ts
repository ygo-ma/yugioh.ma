import type {
  StorageDriver,
  StorageObject,
  StorageObjectHead,
  StoragePutOptions,
} from "./driver";
import { StorageError, type StorageOp } from "./error";

/**
 * Decorator that wraps any `StorageDriver` so backend failures surface as
 * `StorageError` with structured fields. Reads `name` from the wrapped
 * driver. Inner `StorageError` throws pass through to avoid double-wrapping.
 */
class ErrorWrappingDriver implements StorageDriver {
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

export function withStorageErrors(inner: StorageDriver): StorageDriver {
  return new ErrorWrappingDriver(inner);
}
