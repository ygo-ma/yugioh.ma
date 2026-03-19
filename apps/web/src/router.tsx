import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initSentryClient } from "./sentry";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
  });

  initSentryClient(router);

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
