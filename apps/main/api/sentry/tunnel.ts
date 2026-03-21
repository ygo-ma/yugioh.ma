// Sentry tunnel endpoint — proxies client-side Sentry events through our
// server so ad-blockers that block requests to *.sentry.io don't silently
// drop error reports. The client SDK is configured with `tunnel: "/api/sentry"`
// which sends envelopes here instead of directly to Sentry's ingest.
//
// The client uses a dummy DSN (never the real one). This tunnel rewrites the
// envelope header with the real server-side DSN before forwarding to Sentry.

import { Hono } from "hono";
import type { HonoRequest } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../../db/types";

// Parse the server-side DSN to extract the upstream ingest URL.
// DSN format: https://<key>@<host>/<project-id>
function parseUpstreamUrl(serverDsn: string): string {
  try {
    const url = new URL(serverDsn);
    const projectId = url.pathname.replaceAll("/", "");

    if (!/^\d+$/.test(projectId)) {
      throw new Error("Invalid project ID");
    }

    return `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  } catch (error) {
    if (error instanceof HTTPException) throw error;
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
function validateOrigin(req: HonoRequest): void {
  try {
    const host = new URL(req.url).host;
    const origin = req.header("origin");
    if (origin && new URL(origin).host === host) return;
  } catch {
    // Nothing to do
  }

  throw new HTTPException(403);
}

// Read chunks from the stream into the buffer. Returns the final offset.
// Loops until the buffer is full, the stream ends, or a chunk exceeds
// the remaining space (in which case only the fitting portion is copied).
async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  buffer: Uint8Array,
  offset: number,
): Promise<number> {
  let pos = offset;

  while (pos < buffer.length) {
    // chunks must be read sequentially
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;

    const remaining = buffer.length - pos;
    if (value.length > remaining) {
      buffer.set(value.subarray(0, remaining), pos);
      return buffer.length;
    }

    buffer.set(value, pos);
    pos += value.length;
  }

  return pos;
}

// Read and validate the raw envelope body. Requires Content-Length, streams
// into a pre-allocated buffer capped at MAX_BODY_BYTES, and cancels the
// reader to signal the runtime to stop receiving excess data.
async function readEnvelopeBody(raw: Request): Promise<Uint8Array> {
  const header = raw.headers.get("content-length");
  if (!header) {
    throw new HTTPException(400);
  }

  const contentLength = Number(header);
  if (!Number.isInteger(contentLength) || contentLength <= 0) {
    throw new HTTPException(400);
  }

  if (contentLength > MAX_BODY_BYTES) {
    throw new HTTPException(413);
  }

  const reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    raw.body?.getReader();
  if (!reader) {
    throw new HTTPException(400);
  }

  const buffer = new Uint8Array(contentLength);
  let bytesRead: number;
  try {
    bytesRead = await readStreamChunk(reader, buffer, 0);
  } finally {
    await reader.cancel();
  }

  if (bytesRead === 0) {
    throw new HTTPException(400);
  }

  return bytesRead === contentLength ? buffer : buffer.subarray(0, bytesRead);
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
  validateOrigin(context.req);

  const body = await readEnvelopeBody(context.req.raw);
  const rewritten = rewriteEnvelope(body, dsn);
  await forwardEnvelope(upstreamUrl, rewritten);

  return context.body(null, 200);
});
