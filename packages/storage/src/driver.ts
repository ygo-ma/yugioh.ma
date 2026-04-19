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
  /**
   * Custom metadata. Keys are HTTP-header-style: lowercase letters,
   * digits, and `-`, starting with a letter or digit. S3 case-folds
   * `x-amz-meta-*` headers in transit, so we enforce the contract on
   * write across every backend (see `validateMetadataKeys`).
   */
  metadata: Record<string, string>;
}

/** Driver-construction options shared by every backend. */
export interface DriverOptions {
  /** Used when a put() omits cacheControl. Driver writes it to its native
   *  http-metadata field so direct/presigned access serves it too. */
  defaultCacheControl?: string;
}

// Enumerated character classes used by KebabKey. Defined as explicit
// unions instead of relying on Lowercase<X>/Uppercase<X> tricks: those
// misclassify non-letters (e.g. Uppercase<"-"> is "-", which would
// false-positive every hyphen as uppercase).
type LowerLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/** Compile-time check matching `/^[a-z0-9][a-z0-9-]*$/`. */
type KebabKey<TKey extends string> =
  TKey extends `${LowerLetter | Digit}${infer Rest}`
    ? KebabBody<Rest> extends true
      ? TKey
      : never
    : never;

/** Tail-recursive body check: each subsequent char in `[a-z0-9-]`. */
type KebabBody<TKey extends string> = TKey extends ""
  ? true
  : TKey extends `${LowerLetter | Digit | "-"}${infer Rest}`
    ? KebabBody<Rest>
    : false;

/**
 * Maps each metadata key through `KebabKey`. Invalid keys turn the
 * value type into a branded error-string literal — assigning a normal
 * `string` to it fails the compile with the message visible in the TS
 * error. Catches uppercase, leading hyphens, underscores, embedded
 * uppercase, non-ASCII, and empty keys when keys are literal in an
 * object literal. Dynamic / spread keys widen to `Record<string,
 * string>` and are caught by `validateMetadataKeys` at runtime.
 */
export type ValidatedMetadata<TMeta> = {
  [TKey in keyof TMeta]: TKey extends string
    ? TKey extends KebabKey<TKey>
      ? TMeta[TKey]
      : `ERROR: metadata key '${TKey}' must be lowercase kebab-case ([a-z0-9][a-z0-9-]*)`
    : TMeta[TKey];
};

export interface StoragePutOptions<
  TMeta extends Record<string, string> = Record<string, string>,
> {
  contentType: string;
  cacheControl?: string;
  /**
   * Custom metadata. Keys must match `/^[a-z0-9][a-z0-9-]*$/` —
   * lowercase letters, digits, and `-`, starting with a letter or
   * digit. Literal keys are checked at compile time via
   * `ValidatedMetadata`; dynamic keys are caught at runtime by
   * `validateMetadataKeys`. S3 case-folds `x-amz-meta-*` headers in
   * transit so this contract holds across every backend.
   */
  metadata?: ValidatedMetadata<TMeta>;
  /**
   * Expected byte length of the body. Drivers verify the actual byte count
   * matches and abort the put on mismatch. Untrusted callers (e.g. raw
   * Content-Length headers) are safe to pass — verification is enforced.
   */
  sizeHint?: number;
}

export interface StorageDriver {
  get(key: string): Promise<StorageObject | null>;
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
    get: (key) => inner.get(prefixed(key)),
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

/** Public/private bucket → standard Cache-Control string. */
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

const METADATA_KEY_RE = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * Throws on any metadata key that wouldn't survive a round-trip through
 * S3's `x-amz-meta-*` headers. Called by every driver's `put()` so the
 * contract is enforced at the write site, not discovered later by a
 * caller wondering why `uploadedAt` came back as `uploadedat`.
 */
export function validateMetadataKeys(metadata: Record<string, string>): void {
  for (const key of Object.keys(metadata)) {
    if (!METADATA_KEY_RE.test(key)) {
      throw new Error(
        `invalid metadata key: ${JSON.stringify(key)} ` +
          "(must match /^[a-z0-9][a-z0-9-]*$/ — lowercase letters, " +
          "digits, hyphens; starting with letter or digit)",
      );
    }
  }
}
