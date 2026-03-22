import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import * as Sentry from "@sentry/react";
import type { ReactNode } from "react";
import { ErrorFallback } from "~/components/error-fallback";
import mainCss from "@acme/ui/main.css?inline";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Acme App" },
    ],
    styles: [{ children: mainCss }],
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Page not found</p>,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <Sentry.ErrorBoundary fallback={ErrorFallback}>
        <Outlet />
      </Sentry.ErrorBoundary>
    </RootDocument>
  );
}
