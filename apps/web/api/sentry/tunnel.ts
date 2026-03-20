// Sentry tunnel endpoint — proxies client-side Sentry events through our
// server so ad-blockers that block requests to *.sentry.io don't silently
// drop error reports. The client SDK is configured with `tunnel: "/api/sentry"`
// which sends envelopes here instead of directly to Sentry's ingest.

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../db/types";

interface UpstreamUrl {
  url: string;
}

interface ValidationError {
  error: 400 | 403;
}

// Sentry envelopes are newline-delimited: the first line is a JSON header
// containing the DSN the client used. Parse it out so we can validate it.
// Only the header line is decoded as UTF-8 — the rest of the envelope may
// contain binary payloads (e.g., attachments) that must not be re-encoded.
function parseEnvelopeHeader(body: Uint8Array): string | undefined {
  // Newline character
  const newlineIndex = body.indexOf(0x0a);
  if (newlineIndex === -1) {
    return undefined;
  }

  try {
    const headerLine = new TextDecoder().decode(body.subarray(0, newlineIndex));
    const header: unknown = JSON.parse(headerLine);
    if (typeof header === "object" && header !== null && "dsn" in header) {
      const { dsn } = header as { dsn: unknown };
      if (typeof dsn === "string") {
        return dsn;
      }
    }
  } catch {
    // Invalid DSN or malformed JSON
  }

  return undefined;
}

// Prevent open-relay abuse: ensure the client-supplied DSN points to
// *.sentry.io and that its project ID matches our server-side DSN.
function validateAndBuildUpstreamUrl(
  clientDsn: string,
  serverDsn: string,
): UpstreamUrl | ValidationError {
  // Check if the URLs are valid before accessing their properties
  let clientUrl: URL;
  let serverUrl: URL;
  try {
    clientUrl = new URL(clientDsn);
    serverUrl = new URL(serverDsn);
  } catch {
    return { error: 400 };
  }

  // Only allow forwarding to Sentry's own ingest hosts
  if (!clientUrl.hostname.endsWith(".sentry.io")) {
    return { error: 403 };
  }

  // Project ID must match so attackers can't relay to arbitrary projects
  const clientProjectId = clientUrl.pathname.replaceAll("/", "");
  const serverProjectId = serverUrl.pathname.replaceAll("/", "");

  if (clientProjectId !== serverProjectId) {
    return { error: 403 };
  }

  return {
    url: `https://${clientUrl.hostname}/api/${clientProjectId}/envelope/`,
  };
}

const tunnel = new Hono<AppEnv>();

export default tunnel.post("/", async (context) => {
  const dsn = context.env.SENTRY_DSN;

  // Tunnel is only active when Sentry is configured
  if (!dsn) {
    throw new HTTPException(404);
  }

  // Reject obviously oversized payloads before reading the body
  const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
  const contentLength = Number(context.req.header("content-length"));
  if (contentLength > MAX_BODY_BYTES) {
    throw new HTTPException(413);
  }

  // Read the raw envelope as bytes to preserve binary payloads (attachments)
  const body = new Uint8Array(await context.req.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    throw new HTTPException(body.length === 0 ? 400 : 413);
  }

  // Extract the DSN the client claims to use
  const clientDsn = parseEnvelopeHeader(body);
  if (!clientDsn) {
    throw new HTTPException(400);
  }

  // Validate and build the upstream Sentry ingest URL
  const result = validateAndBuildUpstreamUrl(clientDsn, dsn);
  if ("error" in result) {
    throw new HTTPException(result.error);
  }

  // Forward the envelope as-is to Sentry
  try {
    const response = await fetch(result.url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });

    if (!response.ok) {
      throw new HTTPException(502);
    }

    return context.body(null, 200);
  } catch {
    throw new HTTPException(502);
  }
});
