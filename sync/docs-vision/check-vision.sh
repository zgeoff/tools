#!/usr/bin/env bash
# Checks the repo's vision doc, docs/vision.md, against the docs-writing skill's contract. Fails when
# the doc is missing or runs past one page.
# Usage (from the repo root): check-vision.sh
# repo-sync delivers this script beside docs-writing's check-length.sh only to a repo that takes the
# docs-vision-check entry, and check-length.sh runs it when it is there.
set -uo pipefail

[ "$#" -eq 0 ] || {
  echo "usage: check-vision.sh" >&2
  exit 2
}

vision=docs/vision.md
limit=60

# A tracked or untracked doc counts, so a new one passes before it is staged, and an ignored one
# does not.
listed=$(git -c core.quotePath=false ls-files --cached --others --exclude-standard -- "$vision")

if [ -z "$listed" ] || [ ! -f "$vision" ]; then
  echo "$vision: missing; write the vision doc the docs-writing skill's docs-tree reference describes (error)"
  exit 1
fi

lines=$(awk 'END { print NR }' "$vision")

if [ "$lines" -gt "$limit" ]; then
  echo "$vision: $lines lines, over the vision doc limit of $limit (error: cut points to fit one page)"
  exit 1
fi

echo "$vision: $lines lines (vision doc; limit $limit)"
