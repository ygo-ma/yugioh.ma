/**
 * Marker key used to dedupe errors between server and client.
 *
 * The function middleware sets this property (non-enumerable, via
 * `Object.defineProperty`) on errors thrown by server functions when they
 * arrive on the client. The client-side `Sentry.init({ beforeSend })` filter
 * then drops events whose `originalException` carries the marker, preventing
 * the same error from being reported twice (once server-side, once client-side
 * via `Sentry.ErrorBoundary`).
 */
export const CAPTURED = "__sentryServerCaptured";
