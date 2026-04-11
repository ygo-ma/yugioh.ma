import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../server/types";
import { urlFor } from "../../storage";
import { type FileMeta, metaKey, storeFile } from "../../storage/helpers";

const TEST_KEY = "test-image";

const testUpload = new Hono<AppEnv>();

export default testUpload
  .get("/", async (context) => {
    const storage = context.var.storage.public;
    const exists = await storage.hasItem(TEST_KEY);
    const meta = exists
      ? await storage.getItem<FileMeta>(metaKey(TEST_KEY))
      : null;
    return context.json({
      exists,
      url: exists ? urlFor("public", context.env, TEST_KEY) : null,
      uploadedAt: meta?.uploadedAt ?? null,
    });
  })
  .post("/", async (context) => {
    const body = await context.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) {
      throw new HTTPException(400, { message: "missing file" });
    }

    const { key } = await storeFile(context.var.storage.public, file, {
      key: TEST_KEY,
    });
    return context.json({ url: urlFor("public", context.env, key) });
  });
