#!/usr/bin/env bash
# Removes from a delivered Markdown file each block that needs a file the repo
# does not receive, so the copy never links a missing file. A block opens with
# `<!-- repo-sync needs <path> -->`, where the path is relative to the Markdown
# file, and closes with `<!-- repo-sync end -->`. The blank line after a removed
# block goes with it. A kept block keeps its marker lines, which render as
# nothing.
# Usage: remove-excluded-blocks.sh <markdown> [excluded-path]...
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "usage: remove-excluded-blocks.sh <markdown> [excluded-path]..." >&2
  exit 2
fi

markdown="$1"
shift
dir=$(dirname "$markdown")
excluded=()

for path in "$@"; do
  excluded+=("$(realpath -m "$path")")
done

open_pattern='^<!-- repo-sync needs ([^[:space:]]+) -->$'
close_line='<!-- repo-sync end -->'
output=$(mktemp)
trap 'rm -f "$output"' EXIT
number=0
open=0
drop=0
drop_blank=0

while IFS= read -r line || [ -n "$line" ]; do
  number=$((number + 1))

  if [[ "$line" =~ $open_pattern ]]; then
    if [ "$open" -eq 1 ]; then
      echo "remove-excluded-blocks: $markdown:$number opens a block inside another block" >&2
      exit 1
    fi

    open=1
    needed=$(realpath -m "$dir/${BASH_REMATCH[1]}")

    for path in "${excluded[@]}"; do
      if [ "$needed" = "$path" ]; then
        drop=1
      fi
    done
  elif [ "$line" = "$close_line" ]; then
    if [ "$open" -eq 0 ]; then
      echo "remove-excluded-blocks: $markdown:$number closes a block that is not open" >&2
      exit 1
    fi

    open=0

    if [ "$drop" -eq 1 ]; then
      drop=0
      drop_blank=1
      continue
    fi
  fi

  if [ "$drop_blank" -eq 1 ]; then
    drop_blank=0

    if [ -z "$line" ]; then
      continue
    fi
  fi

  if [ "$drop" -eq 0 ]; then
    printf '%s\n' "$line" >> "$output"
  fi
done < "$markdown"

if [ "$open" -eq 1 ]; then
  echo "remove-excluded-blocks: $markdown ends inside a block" >&2
  exit 1
fi

cat "$output" > "$markdown"
