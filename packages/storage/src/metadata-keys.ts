// Metadata-key contract enforced across every backend. Keys must round-trip
// through S3's `x-amz-meta-*` headers (which case-fold), so we restrict to
// `/^[a-z0-9][a-z0-9-]*$/` at both compile and runtime.

// Enumerated character classes used by KebabKey. Defined as explicit
// unions instead of relying on Lowercase<X>/Uppercase<X> tricks: those
// misclassify non-letters (e.g. Uppercase<"-"> is "-", which would
// false-positive every hyphen as uppercase).
type LowerLetter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

/**
 * Compile-time check matching `/^[a-z0-9][a-z0-9-]*$/`.
 */
type KebabKey<TKey extends string> =
  TKey extends `${LowerLetter | Digit}${infer Rest}`
    ? KebabBody<Rest> extends true
      ? TKey
      : never
    : never;

/**
 * Tail-recursive body check: each subsequent char in `[a-z0-9-]`.
 */
type KebabBody<TKey extends string> = TKey extends ""
  ? true
  : TKey extends `${LowerLetter | Digit | "-"}${infer Rest}`
    ? KebabBody<Rest>
    : false;

/**
 * Maps each metadata key through `KebabKey`. Invalid keys become a
 * branded error-string literal that breaks `string` assignment.
 *
 * Catches uppercase, leading hyphens, underscores, non-ASCII, and
 * empty keys when keys are literal in an object literal.
 *
 * Dynamic / spread keys widen to `Record<string, string>` and are
 * caught by `validateMetadataKeys` at runtime.
 */
export type ValidatedMetadata<TMeta> = {
  [TKey in keyof TMeta]: TKey extends string
    ? TKey extends KebabKey<TKey>
      ? TMeta[TKey]
      : `ERROR: metadata key '${TKey}' must be lowercase kebab-case ([a-z0-9][a-z0-9-]*)`
    : TMeta[TKey];
};

export const METADATA_KEY_RE = /^[a-z0-9][a-z0-9-]*$/u;

/**
 * Throws on any metadata key that wouldn't survive a round-trip through
 * S3's `x-amz-meta-*` headers (which case-fold).
 *
 * Enforced at write-site by every driver's `put()`, not discovered
 * later when `uploadedAt` comes back as `uploadedat`.
 */
export function validateMetadataKeys(
  metadata: Record<string, string>,
): asserts metadata is Record<string, string> {
  for (const key of Object.keys(metadata)) {
    if (METADATA_KEY_RE.test(key)) {
      continue;
    }

    const message =
      `invalid metadata key: ${JSON.stringify(key)} must be` +
      "lowercase letters, digits, hyphens; starting with letter or digit";
    throw new Error(message);
  }
}
