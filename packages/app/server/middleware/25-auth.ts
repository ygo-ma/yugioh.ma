import { defineEventHandler } from "nitro/h3";

export default defineEventHandler((event) => {
  if (event.url.pathname === "/api/health") {
    return;
  }

  const credentials = event.context.env.BASIC_AUTH_CREDENTIALS;

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
