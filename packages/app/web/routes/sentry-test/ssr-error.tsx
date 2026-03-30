import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const throwSsrError = createServerFn().handler(() => {
  throw new Error("Sentry test: SSR loader error");
});

export const Route = createFileRoute("/sentry-test/ssr-error")({
  loader: () => throwSsrError(),
  component: SsrError,
});

function SsrError() {
  return (
    <main>
      <h1>SSR Error Test</h1>
      <p>If you see this, the loader did not throw.</p>
    </main>
  );
}
