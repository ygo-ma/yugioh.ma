import { createStart } from "@tanstack/react-start";
import { sentryMiddleware } from "./middleware/sentry";

export const startInstance = createStart(() => ({
  functionMiddleware: [sentryMiddleware],
}));
