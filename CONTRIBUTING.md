# Contributing

## Design Principles

Every page must function without client-side JavaScript. Features
may enhance with JS but must not depend on it.

Keep the initial payload under 14 KB to fit within the TCP
congestion window on a cold connection.

All interfaces must be accessible. Target a perfect Lighthouse
score across all categories.

Honour user preferences: `prefers-color-scheme`,
`prefers-reduced-motion`, and the browser's default font size.

Never leak internal details — stack traces, module paths, or
implementation specifics — in user-facing error messages.

### Planned

- Full localisation. Error messages will use locale-agnostic
  codes rather than human-readable strings.
- Multiple API serializers (JSON, CBOR, etc.).
- The main app and UI library should both have near-complete
  automated test coverage. Code that is untestable due to
  third-party constraints belongs in a dedicated side package.

## Code Style

oxfmt handles all formatting. This is enforced by a pre-commit
hook and in CI.

Always use braced blocks:

```ts
// wrong
if (x) return;

// right
if (x) {
  return;
}
```

When writing comments, keep whole sentences on a single line where
possible. Stay within 80 characters per line.

```ts
// wrong — sentence split across lines for no reason
// Resolve the user's preferred locale
// from the request headers. Request must be
// a Hono request.
const locale = resolveLocale(request);

// right — one sentence, one line
// Resolve the user's preferred locale from the request headers.
// Request must be a Hono request.
const locale = resolveLocale(request);
```

Group related statements into blocks separated by empty lines.

```ts
// wrong — wall of unrelated statements
const user = await getUser(id);
const locale = resolveLocale(request);
const posts = await listPosts(user.id);
const formatted = posts.map((post) => formatPost(post, locale));
response.json(formatted);

// right — grouped by concern
const user = await getUser(id);
const locale = resolveLocale(request);

const posts = await listPosts(user.id);
const formatted = posts.map((post) => formatPost(post, locale));

response.json(formatted);
```
