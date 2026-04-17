#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: ./init.sh <project-slug>"
  echo ""
  echo "Replaces all acme/Acme/ACME placeholders with the given name."
  echo "The slug must be lowercase alphanumeric with optional dashes"
  echo "(e.g. my-project)."
  exit 1
fi

slug="$1"

if ! [[ "$slug" =~ ^[a-z]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "Error: '$slug' is not a valid slug."
  echo "Must start with a lowercase letter; may contain lowercase letters, numbers, and dashes (e.g. my-project)."
  exit 1
fi

# my-project -> MyProject  (avoid bash 4+ ${var^} so macOS bash 3.2 works)
pascal=$(perl -e 'print join("", map { ucfirst } split(/-/, $ARGV[0]))' "$slug")

# my-project -> MY_PROJECT
constant=$(printf '%s' "$slug" | tr 'a-z-' 'A-Z_')

# my-project -> myproject (for identifier-safe and Docker/CF/compose contexts)
flat=$(printf '%s' "$slug" | tr -d '-')

root="$(cd "$(dirname "$0")" && pwd)"

find "$root" -type f \
  -not -path '*/.git/*' \
  -not -name '.git' \
  -not -path '*/node_modules/*' \
  -not -name 'pnpm-lock.yaml' \
  -not -name 'init.sh' \
  -print0 |
while IFS= read -r -d '' file; do
  # Skip binary files
  if file --brief --mime "$file" | grep -q 'charset=binary'; then
    continue
  fi
  # perl instead of sed -i for macOS/BSD portability
  # `\@acme` first preserves npm scope kebab; `acme` last (after Acme/ACME)
  # consumes everything else as flat lowercase, keeping identifiers valid.
  perl -pi -e "s/\@acme/\@$slug/g; s/Acme/$pascal/g; s/ACME/$constant/g; s/acme/$flat/g" "$file"
done

echo "Replaced @acme → @$slug, Acme → $pascal, ACME → $constant, acme → $flat"

# Strip the README's `./init.sh <slug>` instruction line + trailing blank.
if [ -f "$root/README.md" ]; then
  perl -i -0777 -pe 's/^\.\/init\.sh .*\n\n//m' "$root/README.md"
fi

# Strip `<!-- init-strip:start -->...<!-- init-strip:end -->` blocks
# from any markdown file.
find "$root" -type f -name '*.md' \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -print0 |
while IFS= read -r -d '' file; do
  perl -i -0777 -pe \
    's/<!-- init-strip:start -->\n?.*?<!-- init-strip:end -->\n?//gs' \
    "$file"
done

if command -v pnpm &>/dev/null; then
  echo "Regenerating pnpm-lock.yaml..."
  (cd "$root" && pnpm install)
fi

rm -- "$0"
echo "Done. init.sh has been removed."
