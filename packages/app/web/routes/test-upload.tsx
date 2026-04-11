import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiUrl } from "../api-client";

interface TestImageData {
  exists: boolean;
  url: string | null;
  uploadedAt: string | null;
}

const searchSchema = z.object({
  // TODO: replace with flash messages once form error handling is implemented
  error: z.string().optional(),
});

// oxlint-disable-next-line typescript-eslint/no-unsafe-assignment
const uploadTestImage = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const response = await fetch(await apiUrl("/api/v1/test-upload"), {
      method: "POST",
      body: data as unknown as FormData,
    });

    if (!response.ok) {
      // TODO: replace with flash messages once form error handling is implemented
      const message = await response.text();
      // oxlint-disable-next-line typescript-eslint/only-throw-error -- TanStack Start redirect pattern
      throw redirect({
        to: "/test-upload",
        search: {
          error: message || `Upload failed (${String(response.status)})`,
        },
      });
    }

    // oxlint-disable-next-line typescript-eslint/only-throw-error -- TanStack Start redirect pattern
    throw redirect({ to: "/test-upload" });
  },
);

export const Route = createFileRoute("/test-upload")({
  validateSearch: searchSchema,
  loader: async () => {
    const response = await fetch(await apiUrl("/api/v1/test-upload"));
    return response.json() as Promise<TestImageData>;
  },
  component: TestUpload,
});

function TestUpload() {
  const { exists, url, uploadedAt } = Route.useLoaderData();
  const { error } = Route.useSearch();

  return (
    <main>
      <h1>Storage Upload Test</h1>
      <p>
        <Link to="/">← Back to home</Link>
      </p>

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}

      {exists && url ? (
        <>
          <h2>Current image</h2>
          <img
            src={`${url}?v=${uploadedAt ?? Math.random()}`}
            alt="Test upload"
            style={{ maxWidth: "100%", border: "1px solid #ccc" }}
          />
          <p>
            <code>{url}</code>
          </p>
        </>
      ) : (
        <p>No image uploaded yet.</p>
      )}

      <h2>Upload</h2>
      <form
        // oxlint-disable-next-line typescript-eslint/no-unsafe-member-access
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
