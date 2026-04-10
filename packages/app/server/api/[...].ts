import { withSentry } from "@acme/sentry/api";
import type { Env, Hono } from "hono";
import { defineEventHandler } from "nitro/h3";
import app from "../../api/app";
import { createEnvProxy } from "../env";
import type { AppEnv } from "../types";

type Bindings<HonoEnv extends Env> = NonNullable<HonoEnv["Bindings"]>;

function createApiEventHandler<HonoEnv extends Env>(honoApp: Hono<HonoEnv>) {
  return defineEventHandler(({ runtime, req }) => {
    const cfEnv = (runtime?.cloudflare?.env ?? {}) as Bindings<HonoEnv>;
    const env = createEnvProxy(cfEnv);
    const context = runtime?.cloudflare?.context;

    return withSentry(env, req, context, () =>
      honoApp.fetch(req, env, context),
    );
  });
}

export default createApiEventHandler<AppEnv>(app);
