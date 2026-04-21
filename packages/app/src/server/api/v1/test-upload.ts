import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { storeFile } from "@acme/storage/helpers";
import type { AppEnv } from "../../types";
import { type BucketName, presignUrl, urlFor } from "../../storage";

const TEST_KEY = "test-image";

function parseBucket(value: unknown): BucketName {
  return value === "private" ? "private" : "public";
}

const testUpload = new Hono<AppEnv>();

export default testUpload
  .get("/", async (context) => {
    const bucket = parseBucket(context.req.query("bucket"));
    const storage = context.var.storage[bucket];
    const head = await storage.head(TEST_KEY);
    const exists = head !== null;

    let url: string | null = null;
    if (exists) {
      url =
        bucket === "private"
          ? await presignUrl(bucket, context.env, TEST_KEY)
          : urlFor(bucket, context.env, TEST_KEY);
    }

    const uploadedAtRaw = head?.metadata["uploaded-at"];
    const parsed = uploadedAtRaw ? Number(uploadedAtRaw) : Number.NaN;
    const uploadedAt = Number.isFinite(parsed) ? parsed : null;
    return context.json({ exists, bucket, url, uploadedAt });
  })
  .post("/", async (context) => {
    const body = await context.req.parseBody();
    const file = body.file;
    const bucket = parseBucket(body.bucket);
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "missing file" });
    }

    const { key } = await storeFile(context.var.storage[bucket], file, {
      key: TEST_KEY,
      allowedTypes: ["image/*"],
    });

    const url =
      bucket === "private"
        ? await presignUrl(bucket, context.env, key)
        : urlFor(bucket, context.env, key);
    return context.json({ bucket, url });
  });
