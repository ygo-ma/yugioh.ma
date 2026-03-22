import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main>
      <h1>Acme App</h1>
      <p>Welcome to your new app.</p>
      <Link to="/sentry-test">Sentry Test</Link>
    </main>
  );
}
