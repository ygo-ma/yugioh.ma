// Sentry tunnel endpoint — proxies client-side Sentry events through our
// server so ad-blockers that block requests to *.sentry.io don't silently
// drop error reports. The client SDK is configured with `tunnel: "/api/sentry"`
// which sends envelopes here instead of directly to Sentry's ingest.
//
// The client uses a dummy DSN (never the real one). This tunnel rewrites the
// envelope header with the real server-side DSN before forwarding to Sentry.

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../db/types";

// Parse the server-side DSN to extract the upstream ingest URL.
// DSN format: https://<key>@<host>/<project-id>
function parseUpstreamUrl(serverDsn: string): string {
  try {
    const url = new URL(serverDsn);
    const projectId = url.pathname.replaceAll("/", "");

    return `https://${url.hostname}/api/${projectId}/envelope/`;
  } catch {
    throw new HTTPException(500);
  }
}

// Rewrite the envelope's header line, replacing the dummy DSN with the real
// server-side DSN. The rest of the envelope (item headers + binary payloads)
// is left untouched.
function rewriteEnvelope(body: Uint8Array, serverDsn: string): Uint8Array {
  const newlineIndex = body.indexOf(0x0a);
  if (newlineIndex === -1) {
    throw new HTTPException(400);
  }

  let headerJson: string;
  try {
    const headerLine = new TextDecoder().decode(body.subarray(0, newlineIndex));
    const parsed: unknown = JSON.parse(headerLine);
    if (typeof parsed !== "object" || parsed === null) {
      throw new HTTPException(400);
    }
    headerJson = JSON.stringify({ ...parsed, dsn: serverDsn });
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(400);
  }

  const newHeader = new TextEncoder().encode(headerJson);
  const rest = body.subarray(newlineIndex); // includes the newline

  const result = new Uint8Array(newHeader.length + rest.length);
  result.set(newHeader, 0);
  result.set(rest, newHeader.length);
  return result;
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

// Same-origin check: reject requests not originating from our own host.
// Browsers always send the Origin header on POST requests (Fetch spec),
// so missing Origin means a non-browser caller (curl, scripts) — block it.
function validateOrigin(origin: string | undefined, host: string): void {
  if (!origin || new URL(origin).host !== host) {
    throw new HTTPException(403);
  }
}

// Read and validate the raw envelope body, checking content-length before
// buffering and verifying actual size after.
async function readEnvelopeBody(raw: Request): Promise<Uint8Array> {
  const contentLength = Number(raw.headers.get("content-length"));
  if (contentLength > MAX_BODY_BYTES) {
    throw new HTTPException(413);
  }

  const body = new Uint8Array(await raw.arrayBuffer());
  if (body.length === 0 || body.length > MAX_BODY_BYTES) {
    throw new HTTPException(body.length === 0 ? 400 : 413);
  }
  return body;
}

// Forward a rewritten envelope to Sentry's ingest endpoint.
async function forwardEnvelope(
  upstreamUrl: string,
  envelope: Uint8Array,
): Promise<void> {
  try {
    const response = await fetch(upstreamUrl, {
      method: "POST",
      body: envelope,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });

    if (response.ok) return;
  } catch {
    // Nothing to do
  }

  throw new HTTPException(502);
}

const tunnel = new Hono<AppEnv>();

export default tunnel.post("/", async (context) => {
  const dsn = context.env.SENTRY_DSN;
  if (!dsn) {
    throw new HTTPException(404);
  }

  const upstreamUrl = parseUpstreamUrl(dsn);
  const host = context.req.header("host") ?? new URL(context.req.url).host;
  validateOrigin(context.req.header("origin"), host);

  const body = await readEnvelopeBody(context.req.raw);
  const rewritten = rewriteEnvelope(body, dsn);
  await forwardEnvelope(upstreamUrl, rewritten);

  return context.body(null, 200);
});
