import { wrapRequestHandler } from "@sentry/cloudflare";
import { defineEventHandler } from "nitro/h3";
import app from "../../api/app";
import type { CfBindings } from "../types";

export default defineEventHandler((event) => {
  const cfEnv = event.runtime?.cloudflare?.env as CfBindings | undefined;
  const env = cfEnv ?? process.env;
  const dsn = env.SENTRY_DSN;

  if (dsn && event.runtime?.cloudflare?.context) {
    const wrapperOptions = {
      options: {
        dsn,
        environment: env.SENTRY_ENVIRONMENT ?? "development",
        release: env.SENTRY_RELEASE,
        dist: env.SENTRY_DIST,
      },
      request: event.req,
      context: event.runtime.cloudflare.context,
      captureErrors: true,
    };

    return wrapRequestHandler(wrapperOptions, () => app.fetch(event.req, env));
  }

  return app.fetch(event.req, env);
});
