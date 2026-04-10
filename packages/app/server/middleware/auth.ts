import { defineEventHandler } from "nitro/h3";
import { PUBLIC_BUCKETS } from "../../storage/buckets";
import type { CfBindings } from "../types";

const publicBucketReads = PUBLIC_BUCKETS.map((name) => `/media/${name}/`);

export default defineEventHandler((event) => {
  if (event.url.pathname === "/api/health") {
    return;
  }

  // Public buckets: anonymous reads (GET/HEAD) allowed, writes still
  // require auth.
  if (
    (event.req.method === "GET" || event.req.method === "HEAD") &&
    publicBucketReads.some((prefix) => event.url.pathname.startsWith(prefix))
  ) {
    return;
  }

  const cfEnv = event.runtime?.cloudflare?.env as CfBindings | undefined;
  const credentials = (cfEnv ?? process.env).BASIC_AUTH_CREDENTIALS;

  if (!credentials || credentials.trim() === "") {
    return;
  }

  const allowedTokens = credentials.split(";").filter(Boolean);
  const authHeader = event.req.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(authHeader);
  const token = match?.[1] ?? "";

  if (token && allowedTokens.includes(token)) {
    return;
  }

  event.res.status = 401;
  event.res.headers.set("WWW-Authenticate", 'Basic realm="Protected"');

  return "Unauthorized";
});
