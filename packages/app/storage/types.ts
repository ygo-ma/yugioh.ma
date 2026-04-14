import type { Storage } from "unstorage";
import type { BucketName } from "./buckets";

export type { Storage };

export type Buckets = Record<BucketName, Storage>;
