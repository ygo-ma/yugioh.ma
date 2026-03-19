import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sentry-test/error")({
  component: SentryError,
});

function SentryError(): never {
  throw new Error("Sentry test: route render error");
}
