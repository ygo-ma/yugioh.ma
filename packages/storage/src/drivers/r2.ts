import type { R2Bucket } from "@cloudflare/workers-types";
import {
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StorageObjectHead,
  type StoragePutOptions,
} from "../driver";
import { validateMetadataKeys } from "../metadata-keys";

/**
 * R2 binding driver: customMetadata + httpMetadata are stored natively.
 */
export class R2Driver implements StorageDriver {
  readonly name = "r2" as const;

  constructor(
    private readonly binding: R2Bucket,
    private readonly options: DriverOptions = {},
  ) {}

  async get(key: string): Promise<StorageObject | null> {
    const object = await this.binding.get(key);
    if (!object) {
      return null;
    }

    const {
      body,
      httpMetadata = {},
      size,
      customMetadata: metadata = {},
    } = object;
    const { contentType = "application/octet-stream", cacheControl } =
      httpMetadata;

    return {
      // Cast bridges @cloudflare/workers-types' ReadableStream
      // (BYOB-reader shape) to the node/global one consumed by Response.
      body: body as unknown as ReadableStream<Uint8Array>,
      contentType,
      cacheControl,
      size,
      metadata,
    };
  }

  async put<TMeta extends Record<string, string>>(
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: StoragePutOptions<TMeta>,
  ): Promise<void> {
    const {
      sizeHint,
      contentType,
      cacheControl = this.options.defaultCacheControl,
      metadata = {},
    } = options;
    validateMetadataKeys(metadata);

    const verified = validatingStream(body, sizeHint);
    // Cast: workers-types put() expects its own ReadableStream interface;
    // both shapes produce identical bytes at runtime.
    await this.binding.put(key, verified as Uint8Array, {
      httpMetadata: { contentType, cacheControl },
      customMetadata: metadata,
    });
  }

  async head(key: string): Promise<StorageObjectHead | null> {
    const object = await this.binding.head(key);
    if (!object) {
      return null;
    }

    const { httpMetadata = {}, size, customMetadata: metadata = {} } = object;
    const { contentType = "application/octet-stream", cacheControl } =
      httpMetadata;

    return { contentType, cacheControl, size, metadata };
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const object = await this.binding.head(key);
    return object !== null;
  }
}
