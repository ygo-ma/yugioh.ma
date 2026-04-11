import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { apiUrl } from "../api-client";

interface TestImageData {
  exists: boolean;
  url: string | null;
}

// oxlint-disable-next-line typescript-eslint/no-unsafe-assignment
const uploadTestImage = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    await fetch(await apiUrl("/api/v1/test-upload"), {
      method: "POST",
      // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
      body: data as unknown as FormData,
    });

    // oxlint-disable-next-line typescript-eslint/only-throw-error -- TanStack Start redirect pattern
    throw redirect({ to: "/test-upload" });
  },
);

export const Route = createFileRoute("/test-upload")({
  loader: async () => {
    const response = await fetch(await apiUrl("/api/v1/test-upload"));
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
    return response.json() as Promise<TestImageData>;
  },
  component: TestUpload,
});

function TestUpload() {
  const loaderData = Route.useLoaderData();

  return (
    <main>
      <h1>Storage Upload Test</h1>
      <p>
        <Link to="/">← Back to home</Link>
      </p>

      {loaderData.exists && loaderData.url ? (
        <>
          <h2>Current image</h2>
          <img
            src={loaderData.url}
            alt="Test upload"
            style={{ maxWidth: "100%", border: "1px solid #ccc" }}
          />
          <p>
            <code>{loaderData.url}</code>
          </p>
        </>
      ) : (
        <p>No image uploaded yet.</p>
      )}

      <h2>Upload</h2>
      <form
        // oxlint-disable-next-line typescript-eslint/no-unsafe-member-access, typescript-eslint/no-unsafe-type-assertion
        action={uploadTestImage.url}
        method="post"
        encType="multipart/form-data"
      >
        <p>
          <input type="file" name="file" accept="image/*" required />
        </p>
        <p>
          <button type="submit">Upload</button>
        </p>
      </form>
    </main>
  );
}
