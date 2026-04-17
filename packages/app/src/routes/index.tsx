import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@acme/ui";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Acme App</h1>
      <p>Welcome to your new app.</p>
      <br />
      <Link to="/sentry-test">Sentry Test</Link>
      <br />
      <Link to="/test-upload">Storage Upload Test</Link>
      <br />
      <br />
      <Button
        onClick={() => {
          setCount((prev) => prev + 1);
        }}
      >
        Increment ({count})
      </Button>
    </main>
  );
}
