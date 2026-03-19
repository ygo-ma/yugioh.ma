import * as Sentry from "@sentry/react";
import { createFileRoute, Link } from "@tanstack/react-router";

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
          <button type="button" onClick={handleBreadcrumbError}>
            Error with breadcrumbs
          </button>
        </li>
      </ul>
    </main>
  );
}
