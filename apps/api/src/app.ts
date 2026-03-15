import { Hono } from "hono";

const app = new Hono().basePath("/api");

app.get("/health", (context) => context.json({ status: "ok" }));

export default app;
