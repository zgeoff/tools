#!/usr/bin/env bash
# Deletes from the repo in the working directory each file that an earlier
# manifest of the zgeoff/tools checkout delivered and the checked-out manifest
# no longer lists, and prints each deleted path. A file goes only when its
# content matches a version of a source that some manifest delivered to its
# path, so a file the repo wrote itself, or edited after the sync, stays.
#
# A retired file stays while an entry that delivered it is still in the
# manifest and is not in the comma-separated list of entries this run synced,
# because the entry's current files can still need it. A retired file of an
# entry that the comma-separated skip list names stays too, because skip leaves
# an entry alone. The earlier manifests come from the checkout's history, so a
# shallow checkout fails.
# Usage: remove-retired-sync-files.sh <tools-checkout> <synced> [skip]
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  echo "usage: remove-retired-sync-files.sh <tools-checkout> <synced> [skip]" >&2
  exit 2
fi

tools="$1"
synced="$2"
skip="${3:-}"

if [ "$(git -C "$tools" rev-parse --is-shallow-repository)" = true ]; then
  echo "remove-retired-sync-files: $tools is a shallow clone, so it lacks the earlier manifests" >&2
  exit 1
fi

declare -A current=() listed=() entries=() sources=() taken=() skipped=()
while IFS= read -r target; do
  current["$target"]=1
done < <(jq -r '.[].files[].target' "$tools/sync/manifest.json")

while IFS= read -r name; do
  listed["$name"]=1
done < <(jq -r '.[].name' "$tools/sync/manifest.json")

while IFS= read -r name; do
  if [ -n "$name" ]; then
    taken["$name"]=1
  fi
done < <(printf '%s\n' "$synced" | tr ',' '\n' | sed 's/[[:space:]]//g')

while IFS= read -r name; do
  if [ -n "$name" ]; then
    skipped["$name"]=1
  fi
done < <(printf '%s\n' "$skip" | tr ',' '\n' | sed 's/[[:space:]]//g')

rows=$(
  git -C "$tools" log --format=%H -- sync/manifest.json | while IFS= read -r commit; do
    git -C "$tools" show "$commit:sync/manifest.json" |
      jq -r '.[] | .name as $name | .files[] | [.target, $name, .source] | @tsv'
  done | sort -u
)

while IFS=$'\t' read -r target name source; do
  if [ -z "$target" ] || [ -n "${current[$target]:-}" ]; then
    continue
  fi
  entries["$target"]+="$name"$'\n'
  sources["$target"]+="$source"$'\n'
done <<< "$rows"

while IFS= read -r target; do
  if [ -z "$target" ] || [ ! -f "$target" ] || [ -L "$target" ]; then
    continue
  fi
  kept=0
  while IFS= read -r name; do
    if [ -z "$name" ]; then
      continue
    fi
    if [ -n "${skipped[$name]:-}" ] || { [ -n "${listed[$name]:-}" ] && [ -z "${taken[$name]:-}" ]; }; then
      kept=1
    fi
  done <<< "${entries[$target]}"
  if [ "$kept" -eq 1 ]; then
    continue
  fi
  blobs=$(
    printf '%s' "${sources[$target]}" | sort -u | while IFS= read -r source; do
      git -C "$tools" log --format=%H -- "$source" | while IFS= read -r commit; do
        git -C "$tools" rev-parse -q --verify "$commit:$source" || true
      done
    done
  )
  if grep -qxF "$(git hash-object --no-filters -- "$target")" <<< "$blobs"; then
    rm -f -- "$target"
    printf '%s\n' "$target"
  fi
done < <(printf '%s\n' "${!entries[@]}" | sort)
