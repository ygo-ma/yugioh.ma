// Sentry tunnel endpoint — proxies client-side Sentry events through our
// server so ad-blockers that block requests to *.sentry.io don't silently
// drop error reports. The client SDK is configured with `tunnel: "/api/sentry"`
// which sends envelopes here instead of directly to Sentry's ingest.

import { defineEventHandler, HTTPError } from "nitro/h3";
import type { CfBindings } from "../db/types";

interface UpstreamUrl {
  url: string;
}

interface ValidationError {
  error: number;
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

export default defineEventHandler(async (event) => {
  const cfEnv = event.runtime?.cloudflare?.env as CfBindings | undefined;
  const dsn = cfEnv?.SENTRY_DSN ?? process.env.SENTRY_DSN;

  // Tunnel is only active when Sentry is configured
  if (!dsn) {
    throw HTTPError.status(404);
  }

  // Read the raw envelope as bytes to preserve binary payloads (attachments)
  const body = new Uint8Array(await event.req.arrayBuffer());
  if (body.length === 0) {
    throw HTTPError.status(400);
  }

  // Extract the DSN the client claims to use
  const clientDsn = parseEnvelopeHeader(body);
  if (!clientDsn) {
    throw HTTPError.status(400);
  }

  // Validate and build the upstream Sentry ingest URL
  const result = validateAndBuildUpstreamUrl(clientDsn, dsn);
  if ("error" in result) {
    throw HTTPError.status(result.error);
  }

  // Forward the envelope as-is to Sentry
  try {
    const response = await fetch(result.url, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });
    event.res.status = response.status;
    return "";
  } catch {
    throw HTTPError.status(502);
  }
});
