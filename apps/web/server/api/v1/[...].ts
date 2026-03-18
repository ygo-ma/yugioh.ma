import { defineEventHandler } from "nitro/h3";
import app from "../../v1/app";

export default defineEventHandler((event) => {
  const env = event.runtime?.cloudflare?.env ?? {};
  return app.fetch(event.req, env);
});
