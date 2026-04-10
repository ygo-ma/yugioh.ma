/**
 * Single source of truth for the storage buckets the app supports.
 *
 * Each bucket declares its own accessor functions for env-dependent
 * config (R2 binding, S3 bucket name, public URL). The storage resolver
 * and media routes iterate this map automatically — no manual wiring.
 *
 * Adding a new bucket:
 *   1. Add an entry to `BUCKETS` below with its accessors.
 *   2. Add matching bindings to `CfBindings` (`server/types.ts`) and
 *      `wrangler.json` (for Cloudflare) or `compose.yaml` (for Docker).
 *   3. Media routes and storage resolution are automatic.
 */

import type { R2Bucket } from "@cloudflare/workers-types";
import type { CfBindings } from "../server/types";

export interface BucketConfig {
  /** Whether anonymous reads are allowed (no auth, public Cache-Control). */
  public: boolean;
  /** Returns the R2 binding for this bucket, if configured. */
  r2Binding: (env: CfBindings) => R2Bucket | undefined;
  /** Returns the S3-compatible bucket name (from env or default). */
  s3BucketName: (env: CfBindings) => string;
  /** Returns the direct public URL base, if configured. Returns null for private buckets. */
  publicUrl: (env: CfBindings) => string | null;
}

export const BUCKETS = {
  /** Publicly readable content — product images, avatars, post images, … */
  public: {
    public: true,
    r2Binding: (env: CfBindings) => env.STORAGE_PUBLIC,
    s3BucketName: (env: CfBindings) =>
      env.S3_BUCKET_PUBLIC ?? process.env.S3_BUCKET_PUBLIC ?? "acme-public",
    publicUrl: (env: CfBindings) =>
      env.STORAGE_PUBLIC_URL ?? process.env.STORAGE_PUBLIC_URL ?? null,
  } satisfies BucketConfig,
  /** Private user content — message attachments, admin documents, … */
  private: {
    public: false,
    r2Binding: (env: CfBindings) => env.STORAGE_PRIVATE,
    s3BucketName: (env: CfBindings) =>
      env.S3_BUCKET_PRIVATE ?? process.env.S3_BUCKET_PRIVATE ?? "acme-private",
    publicUrl: () => null,
  } satisfies BucketConfig,
};

export type BucketName = keyof typeof BUCKETS;

// oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
export const BUCKET_NAMES = Object.keys(BUCKETS) as BucketName[];
