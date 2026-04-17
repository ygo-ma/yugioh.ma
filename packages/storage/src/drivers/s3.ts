import { AwsClient } from "aws4fetch";
import {
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StoragePutOptions,
} from "../driver";
import type { S3Credentials } from "../types";

const META_PREFIX = "x-amz-meta-";

/** S3-compatible driver via aws4fetch SigV4. Metadata as x-amz-meta-* headers. */
export class S3Driver implements StorageDriver {
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
    return new URL(`/${this.bucket}/${key}`, this.endpoint).toString();
  }

  async get(key: string): Promise<StorageObject | null> {
    const response = await this.client.fetch(this.url(key));
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok || !response.body) {
      throw new Error(`S3 GET failed: ${response.status}`);
    }

    const headers = response.headers;
    const metadata: Record<string, string> = {};
    for (const [name, value] of headers) {
      if (name.startsWith(META_PREFIX)) {
        metadata[name.slice(META_PREFIX.length)] = value;
      }
    }

    return {
      body: response.body,
      contentType: headers.get("content-type") ?? "application/octet-stream",
      cacheControl: headers.get("cache-control") ?? undefined,
      // Spec-compliant providers always set content-length on whole-object
      // GETs; null surfaces non-conforming responses so the proxy omits
      // Content-Length instead of shipping a wrong value.
      size: headers.has("content-length")
        ? Number(headers.get("content-length"))
        : null,
      metadata,
    };
  }

  async put(
    key: string,
    body: ReadableStream<Uint8Array> | Uint8Array,
    options: StoragePutOptions,
  ): Promise<void> {
    const {
      sizeHint,
      contentType,
      cacheControl = this.options.defaultCacheControl,
      metadata = {},
    } = options;

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

    if (!response.ok) {
      throw new Error(`S3 PUT failed: ${response.status}`);
    }
  }

  async delete(key: string): Promise<void> {
    const response = await this.client.fetch(this.url(key), {
      method: "DELETE",
    });

    // 404 is fine — already gone is the desired end-state.
    if (!response.ok && response.status !== 404) {
      throw new Error(`S3 DELETE failed: ${response.status}`);
    }
  }

  async has(key: string): Promise<boolean> {
    const response = await this.client.fetch(this.url(key), { method: "HEAD" });
    return response.ok;
  }
}
