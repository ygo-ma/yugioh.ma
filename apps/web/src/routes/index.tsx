import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main>
      <h1>Yu-Gi-Oh! Morocco</h1>
      <p>Work in progress :)</p>
      <Link to="/sentry-test">Sentry Test</Link>
    </main>
  );
}
