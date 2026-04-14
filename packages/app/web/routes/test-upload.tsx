import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { apiFetch } from "../api-client";

interface TestImageData {
  exists: boolean;
  bucket: string;
  url: string | null;
  uploadedAt: number | null;
}

const searchSchema = z.object({
  bucket: z.enum(["public", "private"]).default("public"),
  // TODO: replace with flash messages once form error handling is implemented
  error: z.string().optional(),
});

// oxlint-disable-next-line typescript-eslint/no-unsafe-assignment
const uploadTestImage = createServerFn({ method: "POST" }).handler(
  async ({ data }) => {
    const formData = data as unknown as FormData;
    const bucket = formData.get("bucket") ?? "public";

    const response = await apiFetch("/api/v1/test-upload", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      // TODO: replace with flash messages once form error handling is implemented
      const message = await response.text();
      // oxlint-disable-next-line typescript-eslint/only-throw-error -- TanStack Start redirect pattern
      throw redirect({
        to: "/test-upload",
        search: {
          bucket: bucket === "private" ? "private" : "public",
          error: message || `Upload failed (${String(response.status)})`,
        },
      });
    }

    // oxlint-disable-next-line typescript-eslint/only-throw-error -- TanStack Start redirect pattern
    throw redirect({
      to: "/test-upload",
      search: { bucket: bucket === "private" ? "private" : "public" },
    });
  },
);

export const Route = createFileRoute("/test-upload")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ bucket: search.bucket }),
  loader: async ({ deps }) => {
    const response = await apiFetch(
      `/api/v1/test-upload?bucket=${deps.bucket}`,
    );
    return response.json() as Promise<TestImageData>;
  },
  component: TestUpload,
});

function ImagePreview({
  bucket,
  url,
  uploadedAt,
}: {
  bucket: string;
  url: string;
  uploadedAt: number | null;
}) {
  const src = bucket === "public" ? `${url}?v=${uploadedAt}` : url;
  return (
    <>
      <h2>Current image ({bucket})</h2>
      <img
        src={src}
        alt="Test upload"
        style={{ maxWidth: "100%", border: "1px solid #ccc" }}
      />
      <p>
        <code>{url}</code>
      </p>
      {bucket === "private" && (
        <p>
          <em>Signed URL — expires in 5 minutes</em>
        </p>
      )}
    </>
  );
}

function TestUpload() {
  const { exists, bucket, url, uploadedAt } = Route.useLoaderData();
  const { error } = Route.useSearch();

  return (
    <main>
      <h1>Storage Upload Test</h1>
      <p>
        <Link to="/">← Back to home</Link>
      </p>
      <p>
        <Link to="/test-upload" search={{ bucket: "public" }}>
          Public
        </Link>
        {" | "}
        <Link to="/test-upload" search={{ bucket: "private" }}>
          Private
        </Link>
      </p>

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}

      {exists && url ? (
        <ImagePreview bucket={bucket} url={url} uploadedAt={uploadedAt} />
      ) : (
        <p>No image uploaded yet in {bucket} bucket.</p>
      )}

      <h2>Upload to {bucket}</h2>
      <form
        // oxlint-disable-next-line typescript-eslint/no-unsafe-member-access
        action={uploadTestImage.url}
        method="post"
        encType="multipart/form-data"
      >
        <input type="hidden" name="bucket" value={bucket} />
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
