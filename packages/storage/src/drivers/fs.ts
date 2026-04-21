import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, resolve as resolvePath, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import {
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StorageObjectHead,
  type StoragePutOptions,
} from "../driver";
import { METADATA_KEY_RE, validateMetadataKeys } from "../metadata-keys";

const HEADER_LEN_BYTES = 4;
// Sanity cap on header size so a corrupted/garbage prefix can't cause us to
// allocate gigabytes when reading. Real headers are a few hundred bytes.
const MAX_HEADER_BYTES = 64 * 1024;

const kebabKey = z
  .string()
  .regex(METADATA_KEY_RE, "must match /^[a-z0-9][a-z0-9-]*$/");

const FsHeaderSchema = z.object({
  contentType: z.string().min(1),
  cacheControl: z.string().optional(),
  metadata: z.record(kebabKey, z.string()),
});
type FsHeader = z.infer<typeof FsHeaderSchema>;

interface ParsedHeader {
  header: FsHeader;
  dataOffset: number;
  size: number;
}

/**
 * Reads the length-prefixed JSON header from an open FileHandle and
 * verifies the file is long enough for the data section.
 *
 * Throws on truncation or corruption. Caller closes the FileHandle.
 */
async function readHeader(
  fd: import("node:fs/promises").FileHandle,
): Promise<ParsedHeader> {
  const lenBuf = Buffer.alloc(HEADER_LEN_BYTES);
  const lenRead = await fd.read(lenBuf, 0, HEADER_LEN_BYTES, 0);
  if (lenRead.bytesRead !== HEADER_LEN_BYTES) {
    throw new Error(
      `FS object truncated: header-length read ${lenRead.bytesRead}/${HEADER_LEN_BYTES} bytes`,
    );
  }
  const headerLen = lenBuf.readUInt32BE(0);
  if (headerLen === 0 || headerLen > MAX_HEADER_BYTES) {
    throw new Error(`FS object header length out of range: ${headerLen}`);
  }

  const headerBuf = Buffer.alloc(headerLen);
  const headerRead = await fd.read(headerBuf, 0, headerLen, HEADER_LEN_BYTES);
  if (headerRead.bytesRead !== headerLen) {
    throw new Error(
      `FS object truncated: header read ${headerRead.bytesRead}/${headerLen} bytes`,
    );
  }
  let header: FsHeader;
  try {
    header = FsHeaderSchema.parse(JSON.parse(headerBuf.toString("utf8")));
  } catch (cause) {
    const message = `FS object header invalid: ${(cause as Error).message}`;
    throw new Error(message, { cause });
  }

  const dataOffset = HEADER_LEN_BYTES + headerLen;
  const fileSize = (await fd.stat()).size;
  if (fileSize < dataOffset) {
    const message = `FS object truncated: file size ${fileSize} < header end ${dataOffset}`;
    throw new Error(message);
  }

  return { header, dataOffset, size: fileSize - dataOffset };
}

/**
 * Writes `[lenBytes][headerBytes][body]` to `tmpPath` atomically.
 * Caller renames on success / rms on failure.
 *
 * The writeStream error listener attaches in the same tick the stream
 * is created so open / early-write failures (EACCES, EROFS, ENOSPC)
 * propagate as a Promise rejection, not an unhandled stream error.
 */
async function writeAtomic(
  tmpPath: string,
  prefix: Buffer,
  body: ReadableStream<Uint8Array> | Uint8Array,
): Promise<void> {
  const writeStream = createWriteStream(tmpPath);
  const writeFailed = new Promise<never>((_resolve, reject) => {
    writeStream.once("error", reject);
  });

  writeStream.write(prefix);

  if (body instanceof Uint8Array) {
    const ended = new Promise<void>((resolve) => {
      writeStream.once("finish", () => {
        resolve();
      });
      writeStream.end(body);
    });
    await Promise.race([ended, writeFailed]);
    return;
  }

  // Cast bridges the global ReadableStream to node:stream/web's variant
  // expected by Readable.fromWeb.
  const source = Readable.fromWeb(body as never);
  await Promise.race([pipeline(source, writeStream), writeFailed]);
}

/**
 * Local filesystem driver. Each object is a single file:
 *
 *   [4 bytes: BE uint32 = header JSON length]
 *   [header JSON]
 *   [data bytes]
 *
 * Concurrent same-key puts are safe: each put writes to a unique tmp
 * file (`${path}.${uuid}.tmp`) and renames atomically into place.
 *
 * Last writer wins, but the file always describes its own data: header
 * and bytes cannot drift out of sync.
 *
 * Concurrent readers keep the previous inode via Unix file semantics;
 * the FileHandle pins it for the whole stream lifetime.
 */
export class FsDriver implements StorageDriver {
  readonly name = "fs" as const;

  private readonly baseAbs: string;

  constructor(
    base: string,
    private readonly options: DriverOptions = {},
  ) {
    this.baseAbs = resolvePath(base);
  }

  /**
   * Resolves a user-supplied key to an absolute path, rejecting any key
   * that escapes `base` (via `..`, absolute segment, or null byte).
   *
   * Single chokepoint for path-traversal defence; every public method
   * routes through here.
   */
  private path(key: string): string {
    if (key.includes("\0")) {
      throw new Error("invalid key: null byte");
    }
    const fullPath = resolvePath(this.baseAbs, key);
    // sep on the prefix prevents `${base}X` from matching `${base}`.
    if (fullPath !== this.baseAbs && !fullPath.startsWith(this.baseAbs + sep)) {
      throw new Error(`invalid key: path escape: ${key}`);
    }
    return fullPath;
  }

  async get(key: string): Promise<StorageObject | null> {
    let fd;
    try {
      fd = await open(this.path(key), "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }

    let parsed: { header: FsHeader; dataOffset: number; size: number };
    try {
      parsed = await readHeader(fd);
    } catch (err) {
      await fd.close();
      throw err;
    }

    // FileHandle.createReadStream pins the inode for the stream's lifetime
    // and auto-closes on end/error/cancel. A concurrent rename of the same
    // key replaces the inode mapping but our fd keeps the old one.
    const nodeStream = fd.createReadStream({ start: parsed.dataOffset });
    const body = Readable.toWeb(
      nodeStream,
    ) as unknown as ReadableStream<Uint8Array>;

    return {
      body,
      contentType: parsed.header.contentType,
      cacheControl: parsed.header.cacheControl,
      size: parsed.size,
      metadata: parsed.header.metadata,
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

    const filePath = this.path(key);
    // Unique tmp per put: concurrent same-key puts never share a tmp path.
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });

    const header: FsHeader = { contentType, cacheControl, metadata };
    const headerBytes = Buffer.from(JSON.stringify(header));
    if (headerBytes.length > MAX_HEADER_BYTES) {
      const message =
        `FS object header would be ${headerBytes.length} bytes, ` +
        `exceeds ${MAX_HEADER_BYTES}`;
      throw new Error(message);
    }
    const lenBytes = Buffer.alloc(HEADER_LEN_BYTES);
    lenBytes.writeUInt32BE(headerBytes.length, 0);

    try {
      const verified = validatingStream(body, sizeHint);
      const prefix = Buffer.concat([lenBytes, headerBytes]);
      await writeAtomic(tmpPath, prefix, verified);
      await rename(tmpPath, filePath);
    } catch (err) {
      await rm(tmpPath, { force: true });
      throw err;
    }
  }

  async head(key: string): Promise<StorageObjectHead | null> {
    let fd;
    try {
      fd = await open(this.path(key), "r");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw err;
    }

    try {
      const { header, size } = await readHeader(fd);
      const { contentType, cacheControl, metadata } = header;
      return { contentType, cacheControl, metadata, size };
    } finally {
      await fd.close();
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.path(key));
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return false;
      }
      // EACCES, EIO, etc. must surface; silently returning false would
      // mask permission/disk failures (health probes would pass).
      throw err;
    }
  }
}
