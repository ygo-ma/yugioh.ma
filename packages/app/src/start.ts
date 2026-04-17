import { createStart } from "@tanstack/react-start";
import { sentryFunctionMiddleware } from "@acme/sentry/middleware";

export const startInstance = createStart(() => ({
  functionMiddleware: [sentryFunctionMiddleware],
}));
