import * as Sentry from "@sentry/core";
import type { User } from "@sentry/core";
import type { Context, Env } from "hono";

interface CaptureHandledErrorOptions {
  /**
   * Additional fields merged into the user scope. Standard Sentry user
   * fields like `id`, `email`, `username` are recognized; arbitrary fields
   * are passed through. The derived `ip_address` from request headers is
   * applied first and can be overridden here.
   */
  user?: User;
  /**
   * Key/value pairs attached to this single capture as Sentry extras.
   * Visible on the event detail view but not searchable.
   */
  extras?: Record<string, unknown>;
  /**
   * Searchable/filterable tags attached to this capture.
   */
  tags?: Record<string, number | string | boolean>;
}

/**
 * Capture an error from inside a Hono route handler that the handler is
 * choosing to swallow (e.g. a cache parse/validation failure that falls
 * through to a database refresh). Enriches the Sentry scope with the same
 * request context as the handler produced by `createSentryHonoErrorHandler`.
 *
 * Use this when you want a problem reported to Sentry but don't want it to
 * surface as a 5xx to the client.
 *
 * Pass `options.user`, `options.extras`, or `options.tags` to attach extra
 * context to the captured event:
 *
 * ```ts
 * captureHandledError(context, error, {
 *   user: { id: userId, email: userEmail },
 *   extras: { cacheKey: POSTS_CACHE_KEY },
 *   tags: { route: "v1/posts", failure: "cache_validation" },
 * });
 * ```
 */
export function captureHandledError<HonoEnv extends Env = Env>(
  context: Context<HonoEnv>,
  error: unknown,
  options?: CaptureHandledErrorOptions,
): string | undefined {
  const ip =
    context.req.header("cf-connecting-ip") ??
    context.req.header("x-forwarded-for")?.split(",")[0]?.trim();

  return Sentry.withScope((scope) => {
    scope.setUser({ ip_address: ip, ...options?.user });
    scope.setExtra("url", context.req.url);
    scope.setExtra("method", context.req.method);
    if (options?.extras) scope.setExtras(options.extras);
    if (options?.tags) scope.setTags(options.tags);
    return Sentry.captureException(error);
  });
}
