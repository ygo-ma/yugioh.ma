import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../server/types";
import { urlFor } from "../../storage";
import { storeFile } from "../../storage/helpers";

const TEST_KEY = "test-image";

const testUpload = new Hono<AppEnv>();

export default testUpload
  .get("/", async (context) => {
    const exists = await context.var.storage.public.hasItem(TEST_KEY);
    return context.json({
      exists,
      url: exists ? urlFor("public", context.env, TEST_KEY) : null,
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
