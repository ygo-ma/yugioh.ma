import { withSentry } from "@acme/sentry/api";
import type { Env, Hono } from "hono";
import { defineEventHandler } from "nitro/h3";
import app from "../../api/app";
import { createEnvProxy } from "../env";
import type { AppEnv } from "../types";

type HonoBindings = NonNullable<Env["Bindings"]>;

function createApiEventHandler<HonoEnv extends Env>(honoApp: Hono<HonoEnv>) {
  return defineEventHandler((event) => {
    const cfEnv = (event.runtime?.cloudflare?.env ?? {}) as HonoBindings;
    const env = createEnvProxy(cfEnv);
    const context = event.runtime?.cloudflare?.context;

    return withSentry({ env, request: event.req, context }, () =>
      honoApp.fetch(event.req, env, context),
    );
  });
}

export default createApiEventHandler<AppEnv>(app);
