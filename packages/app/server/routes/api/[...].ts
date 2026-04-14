import { createApiEventHandler } from "../../handler";
import app from "../../../api/app";
import type { AppEnv } from "../../types";

export default createApiEventHandler<AppEnv>(app);
