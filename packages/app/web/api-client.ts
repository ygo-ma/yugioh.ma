import { createIsomorphicFn } from "@tanstack/react-start";

/**
 * Resolves an API path to a fetchable URL. On the client, returns the
 * path as-is (relative fetch). During SSR, prepends the request origin.
 */
export const apiUrl = createIsomorphicFn()
  .client((path: string) => path)
  .server(async (path: string) => {
    const { getRequestUrl } = await import("@tanstack/react-start/server");
    return `${new URL(getRequestUrl()).origin}${path}`;
  });
