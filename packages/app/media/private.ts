import { createFilesRouter } from "./_files-helpers";

// Private bucket: every method requires basic auth. Use for message
// attachments, administrative documents, anything that should not be
// readable without an authenticated session.
export default createFilesRouter("private");
