import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  validatingStream,
  type DriverOptions,
  type StorageDriver,
  type StorageObject,
  type StoragePutOptions,
} from "../driver";

const HEADER_LEN_BYTES = 4;
// Sanity cap on header size so a corrupted/garbage prefix can't cause us to
// allocate gigabytes when reading. Real headers are a few hundred bytes.
const MAX_HEADER_BYTES = 64 * 1024;

interface FsHeader {
  contentType: string;
  cacheControl?: string;
  metadata: Record<string, string>;
}

/**
 * Local filesystem driver. Each object is a single file:
 *
 *   [4 bytes: BE uint32 = header JSON length]
 *   [header JSON]
 *   [data bytes]
 *
 * Concurrent same-key puts are safe: each put writes to a unique tmp file
 * (`${path}.${uuid}.tmp`) and renames atomically into place. Last writer
 * wins, but the file always describes its own data — header and bytes
 * cannot drift out of sync. Concurrent readers keep the previous inode
 * via Unix file semantics; the FileHandle handed to createReadStream
 * pins it for the whole stream lifetime.
 */
export class FsDriver implements StorageDriver {
  constructor(
    private readonly base: string,
    private readonly options: DriverOptions = {},
  ) {}

  private path(key: string): string {
    return join(this.base, key);
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

    let header: FsHeader;
    let dataOffset: number;
    let size: number;
    try {
      const lenBuf = Buffer.alloc(HEADER_LEN_BYTES);
      await fd.read(lenBuf, 0, HEADER_LEN_BYTES, 0);
      const headerLen = lenBuf.readUInt32BE(0);
      if (headerLen === 0 || headerLen > MAX_HEADER_BYTES) {
        throw new Error(`FS object header length out of range: ${headerLen}`);
      }

      const headerBuf = Buffer.alloc(headerLen);
      await fd.read(headerBuf, 0, headerLen, HEADER_LEN_BYTES);
      header = JSON.parse(headerBuf.toString("utf8")) as FsHeader;

      dataOffset = HEADER_LEN_BYTES + headerLen;
      size = (await fd.stat()).size - dataOffset;
    } catch (err) {
      await fd.close();
      throw err;
    }

    // FileHandle.createReadStream pins the inode for the stream's lifetime
    // and auto-closes on end/error/cancel. A concurrent rename of the same
    // key replaces the inode mapping but our fd keeps the old one.
    const nodeStream = fd.createReadStream({ start: dataOffset });
    const body = Readable.toWeb(
      nodeStream,
    ) as unknown as ReadableStream<Uint8Array>;

    return {
      body,
      contentType: header.contentType,
      cacheControl: header.cacheControl,
      size,
      metadata: header.metadata,
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

    const filePath = this.path(key);
    // Unique tmp per put: concurrent same-key puts never share a tmp path.
    const tmpPath = `${filePath}.${randomUUID()}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });

    const header: FsHeader = { contentType, cacheControl, metadata };
    const headerBytes = Buffer.from(JSON.stringify(header));
    const lenBytes = Buffer.alloc(HEADER_LEN_BYTES);
    lenBytes.writeUInt32BE(headerBytes.length, 0);

    try {
      const writeStream = createWriteStream(tmpPath);
      writeStream.write(Buffer.concat([lenBytes, headerBytes]));

      const verified = validatingStream(body, sizeHint);
      if (verified instanceof Uint8Array) {
        await new Promise<void>((resolve, reject) => {
          writeStream.once("finish", () => {
            resolve();
          });
          writeStream.once("error", reject);
          writeStream.end(verified);
        });
      } else {
        // Cast bridges the global ReadableStream to node:stream/web's variant
        // expected by Readable.fromWeb.
        const source = Readable.fromWeb(verified as never);
        await pipeline(source, writeStream);
      }

      await rename(tmpPath, filePath);
    } catch (err) {
      await rm(tmpPath, { force: true });
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async has(key: string): Promise<boolean> {
    try {
      await access(this.path(key));
      return true;
    } catch {
      return false;
    }
  }
}
