export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_SENTRY_ENABLED: string | undefined;
    readonly VITE_SENTRY_ENVIRONMENT: string | undefined;
    readonly VITE_SENTRY_RELEASE: string | undefined;
    readonly VITE_SENTRY_DIST: string | undefined;
  }
}
