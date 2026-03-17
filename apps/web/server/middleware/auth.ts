import { defineEventHandler } from "nitro/h3";

export default defineEventHandler((event) => {
  const cfValue = event.runtime?.cloudflare?.env.BASIC_AUTH_CREDENTIALS;
  const credentials =
    (typeof cfValue === "string" ? cfValue : null) ??
    process.env.BASIC_AUTH_CREDENTIALS;

  if (credentials === undefined || credentials.trim() === "") {
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
