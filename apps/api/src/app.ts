import { Hono } from "hono";
import type { AppEnv } from "./db/types";
import { dbMiddleware } from "./db/index";

const app = new Hono<AppEnv>().basePath("/api");

app.use(dbMiddleware);

app.get("/health", (context) => context.json({ status: "ok" }));

export default app;
