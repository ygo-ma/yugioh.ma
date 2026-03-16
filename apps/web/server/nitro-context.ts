import type { H3EventContext } from "nitro/h3";
import type { CfBindings } from "@ygoma/api/db/types";

export interface NitroEventContext extends H3EventContext {
  // Only available in Cloudflare Workers environment
  cloudflare?: {
    env: CfBindings;
  };
}
