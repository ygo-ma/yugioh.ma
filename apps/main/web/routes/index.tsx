import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@ygoma/ui";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [count, setCount] = useState(0);

  return (
    <main>
      <h1>Yu-Gi-Oh! Morocco</h1>
      <p>Work in progress :)</p>
      <br />
      <Link to="/sentry-test">Sentry Test</Link>
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
