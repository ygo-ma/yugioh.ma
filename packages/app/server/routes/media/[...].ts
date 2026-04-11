import { createApiEventHandler } from "../../handler";
import app from "../../../media/app";
import type { AppEnv } from "../../types";

export default createApiEventHandler<AppEnv>(app);
