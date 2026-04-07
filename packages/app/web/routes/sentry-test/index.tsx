import { Sentry } from "@acme/sentry/client";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const throwFormActionError = createServerFn({ method: "POST" }).handler(() => {
  throw new Error("Sentry test: form action error");
});

export const Route = createFileRoute("/sentry-test/")({
  component: SentryTest,
});

function handleClickError() {
  throw new Error("Client-side onclick error");
}

function handleUnhandledRejection() {
  void Promise.reject(new Error("Unhandled promise rejection"));
}

function handleCaptureMessage() {
  Sentry.captureMessage("Manual test message from /sentry-test");
}

async function handleApiError() {
  const response = await fetch("/api/v1/sentry-test");
  console.log("API error response:", response.status, await response.text());
}

function handleBreadcrumbError() {
  Sentry.addBreadcrumb({
    message: "User clicked breadcrumb test",
    level: "info",
  });
  Sentry.addBreadcrumb({ message: "About to throw", level: "warning" });
  throw new Error("Error with manual breadcrumbs");
}

function SentryTest() {
  return (
    <main>
      <h1>Sentry Test</h1>
      <ul>
        <li>
          <Link to="/sentry-test/error">Route that throws on render</Link>
        </li>
        <li>
          <Link to="/sentry-test/ssr-error">SSR loader error</Link>
        </li>
        <li>
          <button type="button" onClick={handleClickError}>
            Throw error on click
          </button>
        </li>
        <li>
          <button type="button" onClick={handleUnhandledRejection}>
            Unhandled promise rejection
          </button>
        </li>
        <li>
          <button type="button" onClick={handleCaptureMessage}>
            Send captureMessage
          </button>
        </li>
        <li>
          <button type="button" onClick={() => void handleApiError()}>
            Trigger API error (GET /api/v1/sentry-test)
          </button>
        </li>
        <li>
          <button type="button" onClick={handleBreadcrumbError}>
            Error with breadcrumbs
          </button>
        </li>
        <li>
          <form method="post" action={throwFormActionError.url}>
            <button type="submit">Form action error (no JS needed)</button>
          </form>
        </li>
      </ul>
    </main>
  );
}
