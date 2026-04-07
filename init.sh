#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "Usage: ./init.sh <project-slug>"
  echo ""
  echo "Replaces all @acme/acme placeholders with the given name."
  echo "The slug must be lowercase alphanumeric with optional dashes"
  echo "(e.g. my-project)."
  exit 1
fi

slug="$1"

if ! [[ "$slug" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
  echo "Error: '$slug' is not a valid slug."
  echo "Use lowercase letters, numbers, and dashes (e.g. my-project)."
  exit 1
fi

root="$(cd "$(dirname "$0")" && pwd)"

find "$root" -type f \
  -not -path '*/.git/*' \
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
  perl -pi -e "s/\@acme/\@$slug/g; s/acme/$slug/g" "$file"
done

echo "Replaced @acme → @$slug and acme → $slug"

if command -v pnpm &>/dev/null; then
  echo "Regenerating pnpm-lock.yaml..."
  (cd "$root" && pnpm install)
fi

rm -- "$0"
echo "Done. init.sh has been removed."
