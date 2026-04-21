import type { KVNamespace } from "@cloudflare/workers-types";
import {
  bufferBody,
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StorageObjectHead,
  type StoragePutOptions,
} from "../driver";
import { validateMetadataKeys } from "../metadata-keys";

// Module-level flag so isolate restarts don't spam logs across requests.
let warned = false;

// 20 MiB cap (KV's hard ceiling is 25). Headroom for the worker heap,
// and a signal that larger blobs belong on R2/S3; KV is the fallback.
const KV_BUFFER_LIMIT = 20 * 1024 * 1024;

// KV has no native HTTP metadata. contentType/cacheControl/size travel
// inside the 1024-byte metadata blob alongside user metadata.
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
  readonly name = "kv" as const;

  constructor(
    private readonly binding: KVNamespace,
    private readonly options: DriverOptions = {},
  ) {
    if (!warned) {
      warned = true;

      const message =
        "[storage] KvDriver is a testing-only fallback. " +
        "head() reads the full value and cancels; for production use R2 or S3.";
      console.warn(message);
    }
  }

  async get(key: string): Promise<StorageObject | null> {
    const result = await this.binding.getWithMetadata<KvStoredMetadata>(
      key,
      "stream",
    );

    if (!result.value) {
      return null;
    }

    if (!result.metadata) {
      // Legacy/garbage object with no metadata; drain so KV releases
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
      metadata: user = {},
    } = options;
    validateMetadataKeys(user);

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

    const metadata = { contentType, cacheControl, size, user };

    // Cast bridges global ReadableStream to workers-types' variant.
    await this.binding.put(key, value as Uint8Array, { metadata });
  }

  async head(key: string): Promise<StorageObjectHead | null> {
    const result = await this.binding.getWithMetadata<KvStoredMetadata>(
      key,
      "stream",
    );
    if (!result.value) {
      return null;
    }

    // KV has no head endpoint; cancel the body stream so KV releases
    // the connection before we return.
    await result.value.cancel();
    if (!result.metadata) {
      return null;
    }

    const { contentType, cacheControl, size, user } = result.metadata;
    return { contentType, cacheControl, size, metadata: user };
  }

  async delete(key: string): Promise<void> {
    await this.binding.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const result = await this.binding.list({ prefix: key, limit: 1 });
    return result.keys[0]?.name === key;
  }
}
