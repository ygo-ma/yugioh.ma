import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

interface ErrorFallbackProps {
  error: unknown;
  resetError: () => void;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const router = useRouter();

  useEffect(() => {
    return router.subscribe("onResolved", resetError);
  }, [router, resetError]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : "Unknown error"}</p>
    </main>
  );
}
