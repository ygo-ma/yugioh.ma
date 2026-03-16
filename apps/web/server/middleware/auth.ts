import { defineEventHandler } from "nitro/h3";
import type { NitroEventContext } from "../nitro-context";

export default defineEventHandler((event) => {
  const context = event.context as NitroEventContext;
  const credentials =
    context.cloudflare?.env.BASIC_AUTH_CREDENTIALS ??
    process.env.BASIC_AUTH_CREDENTIALS ??
    "";

  if (!credentials) {
    return null;
  }

  const allowedTokens = credentials.split(";").filter(Boolean);
  const authHeader = event.req.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(authHeader);
  const token = match?.[1] ?? "";

  if (token && allowedTokens.includes(token)) {
    return null;
  }

  event.res.status = 401;
  event.res.headers.set("WWW-Authenticate", 'Basic realm="Protected"');

  return "Unauthorized";
});
