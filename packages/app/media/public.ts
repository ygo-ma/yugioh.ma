import { createFilesRouter } from "./_files-helpers";

// Public bucket: GETs are anonymous (see server/middleware/auth.ts), writes
// still require basic auth. Use for product images, avatars, post images, etc.
export default createFilesRouter("public");
