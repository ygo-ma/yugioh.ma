import { createApiEventHandler } from "@acme/sentry/api";
import app from "../../api/app";

export default createApiEventHandler(app);
