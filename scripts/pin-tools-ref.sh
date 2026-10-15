#!/usr/bin/env bash
# Pins every call to a zgeoff/tools workflow in a repo's .github/workflows/ to
# one ref, such as a sync tag, and prints each file it changed.
# Usage: pin-tools-ref.sh <ref> [repo-dir]
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: pin-tools-ref.sh <ref> [repo-dir]" >&2
  exit 2
fi

ref="$1"
dir="${2:-.}"

if [[ ! "$ref" =~ ^[A-Za-z0-9._/-]+$ ]]; then
  echo "pin-tools-ref: '$ref' is not a ref this script writes" >&2
  exit 2
fi

if [ ! -d "$dir/.github/workflows" ]; then
  echo "pin-tools-ref: $dir has no .github/workflows directory" >&2
  exit 1
fi

pattern='(zgeoff/tools/\.github/workflows/[^@[:space:]]+)@[^[:space:]]+'

while IFS= read -r -d '' file; do
  if grep -qE "$pattern" "$file"; then
    before=$(cat "$file")
    sed -i -E "s#$pattern#\\1@$ref#g" "$file"
    if [ "$before" != "$(cat "$file")" ]; then
      echo "$file"
    fi
  fi
done < <(find "$dir/.github/workflows" -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print0 | sort -z)
