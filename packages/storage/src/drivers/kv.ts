import type { KVNamespace } from "@cloudflare/workers-types";
import {
  bufferBody,
  validateMetadataKeys,
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StoragePutOptions,
} from "../driver";

// 20 MiB cap (KV's hard ceiling is 25). Headroom for the worker heap,
// and a signal that larger blobs belong on R2/S3 — KV is the fallback.
const KV_BUFFER_LIMIT = 20 * 1024 * 1024;

// KV has no native HTTP metadata, so contentType/cacheControl/size travel
// inside the single 1024-byte metadata blob alongside user metadata. The
// proxy serves cacheControl from there; direct access to KV is not exposed.
interface KvStoredMetadata {
  contentType: string;
  cacheControl?: string;
  size: number;
  user: Record<string, string>;
}

/**
 * KV binding driver: metadata stored via the binding's native metadata field.
 */
export class KvDriver implements StorageDriver {
  constructor(
    private readonly binding: KVNamespace,
    private readonly options: DriverOptions = {},
  ) {}

  async get(key: string): Promise<StorageObject | null> {
    const result = await this.binding.getWithMetadata<KvStoredMetadata>(
      key,
      "stream",
    );

    if (!result.value) {
      return null;
    }

    if (!result.metadata) {
      // Legacy/garbage object with no metadata — drain so KV releases
      // the connection rather than leak it.
      await result.value.cancel();
      return null;
    }

    return {
      // Cast bridges workers-types' ReadableStream to the node/global one.
      body: result.value as unknown as ReadableStream<Uint8Array>,
      contentType: result.metadata.contentType,
      cacheControl: result.metadata.cacheControl,
      size: result.metadata.size,
      metadata: result.metadata.user,
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

    // KV needs `size` in metadata, set at put-time. With a sizeHint we can
    // stream: the validating transform aborts the put on mismatch (KV puts
    // are atomic), so the hint is guaranteed to match the stored bytes.
    // Without a hint we must buffer to learn the size.
    const useStream = sizeHint !== undefined || body instanceof Uint8Array;
    const value = useStream
      ? validatingStream(body, sizeHint)
      : await bufferBody(body, KV_BUFFER_LIMIT);
    const size =
      sizeHint ?? (value instanceof Uint8Array ? value.byteLength : 0);

    const kvMetadata: KvStoredMetadata = {
      contentType,
      cacheControl,
      size,
      user: metadata,
    };

    // Cast bridges global ReadableStream to workers-types' variant.
    await this.binding.put(key, value as Uint8Array, { metadata: kvMetadata });
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const result = await this.binding.list({ prefix: key, limit: 1 });
    return result.keys[0]?.name === key;
  }
}
