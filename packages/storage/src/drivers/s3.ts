import { AwsClient } from "aws4fetch";
import {
  validateMetadataKeys,
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StoragePutOptions,
} from "../driver";
import { StorageError } from "../error";
import type { S3Credentials } from "../types";
import { encodeKeyPath } from "../url";

const META_PREFIX = "x-amz-meta-";

/**
 * S3-compatible driver via aws4fetch SigV4. Metadata as x-amz-meta-* headers.
 */
export class S3Driver implements StorageDriver {
  readonly name = "s3" as const;

  private readonly client: AwsClient;
  private readonly endpoint: string;
  private readonly bucket: string;

  constructor(
    creds: S3Credentials,
    bucket: string,
    private readonly options: DriverOptions = {},
  ) {
    this.client = new AwsClient({
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      region: creds.region ?? "auto",
      service: "s3",
    });
    this.endpoint = creds.endpoint;
    this.bucket = bucket;
  }

  private url(key: string): string {
    return new URL(
      `/${this.bucket}/${encodeKeyPath(key)}`,
      this.endpoint,
    ).toString();
  }

  async get(key: string): Promise<StorageObject | null> {
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) {
      // Drain the body so undici can release the socket back to the pool.
      await response.body?.cancel();
      throw new StorageError({
        driver: this.name,
        op: "get",
        key,
        status: response.status,
      });
    }

    const headers = response.headers;
    const metadata: Record<string, string> = {};
    for (const [name, value] of headers) {
      if (name.startsWith(META_PREFIX)) {
        metadata[name.slice(META_PREFIX.length)] = value;
      }
    }

    // Strict parse: Number() would let NaN, decimals, negatives, and
    // empty strings through and we'd later ship Content-Length: NaN
    // (or wrong byte counts). Anything malformed -> null -> proxy omits
    // the header and falls back to chunked transfer.
    const lenRaw = headers.get("content-length");
    const lenParsed = lenRaw === null ? Number.NaN : Number(lenRaw);
    const size =
      Number.isInteger(lenParsed) && lenParsed >= 0 ? lenParsed : null;

    return {
      body: response.body,
      contentType: headers.get("content-type") ?? "application/octet-stream",
      cacheControl: headers.get("cache-control") ?? undefined,
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

    const headers: Record<string, string> = {
      "Content-Type": contentType,
    };
    if (cacheControl) {
      headers["Cache-Control"] = cacheControl;
    }

    for (const [name, value] of Object.entries(metadata)) {
      headers[`${META_PREFIX}${name}`] = value;
    }

    const response = await this.client.fetch(this.url(key), {
      method: "PUT",
      headers,
      body: validatingStream(body, sizeHint),
    });
    // Body never read; cancel so undici frees the socket.
    await response.body?.cancel();

    if (!response.ok) {
      throw new StorageError({
        driver: this.name,
        op: "put",
        key,
        status: response.status,
      });
    }
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), {
      method: "DELETE",
    });
    await response.body?.cancel();

    // 404 is fine: already gone is the desired end-state.
    if (!response.ok && response.status !== 404) {
      throw new StorageError({
        driver: this.name,
        op: "delete",
        key,
        status: response.status,
      });
    }
  }

  async has(key: string): Promise<boolean> {
    const response = await this.client.fetch(this.url(key), { method: "HEAD" });
    // HEAD spec says no body, but undici still creates an empty stream
    // that holds the socket until cancelled.
    await response.body?.cancel();

    if (response.status === 404) {
      return false;
    }

    if (response.ok) {
      return true;
    }

    // 403 / 5xx / auth failures must surface; silently returning false
    // would mask outages (health probes would pass on broken S3).
    throw new StorageError({
      driver: this.name,
      op: "has",
      key,
      status: response.status,
    });
  }
}
