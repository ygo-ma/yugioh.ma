export type StorageOp = "get" | "head" | "put" | "delete" | "has";

export interface StorageErrorDetails {
  driver: string;
  op: StorageOp;
  key: string;
  status?: number;
  cause?: unknown;
}

/**
 * Uniform error class for storage-backend failures. Carries structured
 * fields (driver, op, key, status) so Sentry / logs can group and filter
 * across backends. The original error is preserved as `cause`.
 */
export class StorageError extends Error {
  readonly driver: string;
  readonly op: StorageOp;
  readonly key: string;
  readonly status?: number;

  constructor(
    details: StorageErrorDetails,
    message: string = StorageError.defaultMessage(details),
  ) {
    super(message, { cause: details.cause });

    this.name = "StorageError";
    this.driver = details.driver;
    this.op = details.op;
    this.key = details.key;
    this.status = details.status;
  }

  private static defaultMessage({
    status,
    driver,
    op,
    key,
  }: StorageErrorDetails): string {
    const statusMessage = status === undefined ? "" : ` (status ${status})`;
    return `${driver} ${op} failed for key=${key}${statusMessage}`;
  }
}
