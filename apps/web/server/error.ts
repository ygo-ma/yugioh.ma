import type { NitroErrorHandler } from "nitro/types";

const errorHandler: NitroErrorHandler = (error) => {
  const cause = error.cause ?? error;
  console.error(
    cause instanceof Error ? (cause.stack ?? cause.message) : cause,
  );
};

export default errorHandler;
