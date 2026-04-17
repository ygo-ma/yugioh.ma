import { createIsomorphicFn } from "@tanstack/react-start";

const FORWARDED_HEADERS = [
  "authorization",
  "cookie",
  "accept-language",
  "x-forwarded-for",
];

/**
 * Fetch wrapper for internal API calls.
 *
 * - **Client**: plain `fetch` with relative path (browser handles auth).
 * - **Server (SSR)**: fetches against the request origin with
 *   auth-related headers forwarded from the original request.
 */
export const apiFetch = createIsomorphicFn()
  .client((path: string, init?: RequestInit) => fetch(path, init))
  .server(async (path: string, init?: RequestInit) => {
    const { getRequestHeaders, getRequestUrl } =
      await import("@tanstack/react-start/server");

    // Forward selected headers from the incoming request to preserve auth
    const incoming = new Headers(getRequestHeaders() as HeadersInit);
    const headers = new Headers(init?.headers);
    for (const key of FORWARDED_HEADERS) {
      const value = incoming.get(key);
      if (value) {
        headers.set(key, value);
      }
    }

    const origin = new URL(getRequestUrl()).origin;
    return fetch(`${origin}${path}`, { ...init, headers });
  });
