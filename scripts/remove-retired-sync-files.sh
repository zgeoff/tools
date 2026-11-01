#!/usr/bin/env bash
# Deletes from the repo in the working directory each file that an earlier
# manifest of the zgeoff/tools checkout delivered and the checked-out manifest
# no longer lists, and prints each deleted path. A file goes only when its
# content matches a version of a source that some manifest delivered to its
# path, so a file the repo wrote itself, or edited after the sync, stays.
#
# A renamed file is the exception. When the source of a retired file moved to
# a source that the same entry still delivers, and the run synced that entry
# and wrote the new target, the old copy goes whatever its content, because the
# sync overwrites the same file at its new path. git's rename detection over
# the checkout's history finds the move, so a repo that skipped the tags
# between the move and this run loses the old copy too. The newline-separated
# list of targets the run copied names the new targets it wrote; a target that
# `except` kept from the repo is not in it, so its old copy stays.
#
# A retired file stays while an entry that delivered it is still in the
# manifest and is not in the comma-separated list of entries this run synced,
# because the entry's current files can still need it. A retired file of an
# entry that the comma-separated skip list names stays too, because skip leaves
# an entry alone. The earlier manifests come from the checkout's history, so a
# shallow checkout fails.
#
# A file whose `repo` is zgeoff/skills names a source in that repo, so the
# versions of that source and its renames come from the history of the
# zgeoff/skills checkout. Without that checkout, a retired file whose sources
# all sat in zgeoff/skills stays.
# Usage: remove-retired-sync-files.sh <tools-checkout> <synced> [skip [copied [skills-checkout]]]
set -euo pipefail

if [ $# -lt 2 ] || [ $# -gt 5 ]; then
  echo "usage: remove-retired-sync-files.sh <tools-checkout> <synced> [skip [copied [skills-checkout]]]" >&2
  exit 2
fi

tools="$1"
synced="$2"
skip="${3:-}"
copied_targets="${4:-}"
skills="${5:-}"

checkouts=("$tools")
if [ -n "$skills" ]; then
  checkouts+=("$skills")
fi

for checkout in "${checkouts[@]}"; do
  if [ "$(git -C "$checkout" rev-parse --is-shallow-repository)" = true ]; then
    echo "remove-retired-sync-files: $checkout is a shallow clone, so it lacks the history the cleanup reads" >&2
    exit 1
  fi
done

# Prints the checkout of the repo that an entry names, or nothing when the run
# has no checkout of it.
checkout_of() {
  case "$1" in
    zgeoff/tools) printf '%s' "$tools" ;;
    zgeoff/skills) printf '%s' "$skills" ;;
  esac
}

here=$(dirname "${BASH_SOURCE[0]}")

# Prints the hash of each form in which a sync run could deliver the blob to
# the target. A workflow's calls to a zgeoff/tools workflow name the ref of the
# run and a `# main` comment, so every such call reads @main with no comment in
# the hash, and the copy is hashed the same way. A Markdown file loses the blocks that need a file the repo does
# not receive, so each subset of the needed paths gives one form. A file that
# needs more than 8 paths gets only its unchanged form, which keeps the copy
# rather than hash 2^n forms.
print_delivered_hashes() {
  local checkout=$1 target=$2 blob=$3 work count mask index
  local needs=() excluded=()
  if [[ "$target" != *.md ]]; then
    git -C "$checkout" cat-file blob "$blob" | to_delivered_form "$target" | git hash-object --stdin
    return
  fi
  work=$(mktemp -d)
  git -C "$checkout" cat-file blob "$blob" > "$work/source.md"
  mapfile -t needs < <(sed -nE 's/^<!-- repo-sync needs ([^[:space:]]+) -->$/\1/p' "$work/source.md" | sort -u)
  count=${#needs[@]}
  if [ "$count" -gt 8 ]; then
    count=0
  fi
  for ((mask = 0; mask < (1 << count); mask++)); do
    excluded=()
    for ((index = 0; index < count; index++)); do
      if ((mask & (1 << index))); then
        excluded+=("$work/${needs[$index]}")
      fi
    done
    cp "$work/source.md" "$work/copy.md"
    if bash "$here/remove-excluded-blocks.sh" "$work/copy.md" "${excluded[@]}"; then
      git hash-object --no-filters "$work/copy.md"
    fi
  done
  rm -rf "$work"
}

to_delivered_form() {
  local target=$1
  if [[ "$target" == .github/workflows/* ]]; then
    sed -E "s|(zgeoff/tools/\.github/workflows/[^]@[:space:]\"'{},]+)@[A-Za-z0-9._/-]+([\"']?)( # main)?|\1@main\2|g"
  else
    cat
  fi
}

declare -A current=() listed=() entries=() sources=() taken=() skipped=() moved=() renamed=() copied=()
while IFS= read -r target; do
  current["$target"]=1
done < <(jq -r '.[].files[].target' "$tools/sync/manifest.json")

while IFS= read -r name; do
  listed["$name"]=1
done < <(jq -r '.[].name' "$tools/sync/manifest.json")

# Each earlier path of a source that an entry delivers now, keyed by the entry,
# the source's repo and that path, maps to the source's current target.
while IFS=$'\t' read -r name repo source target; do
  checkout=$(checkout_of "$repo")
  if [ -z "$checkout" ]; then
    continue
  fi
  while IFS= read -r path; do
    if [ -n "$path" ] && [ "$path" != "$source" ]; then
      moved["$name"$'\t'"$repo"$'\t'"$path"]="$target"
    fi
  done < <(git -C "$checkout" log --follow --name-only --format= -- "$source" | sort -u)
done < <(jq -r '.[] | .name as $name | .files[]
  | [$name, (.repo // "zgeoff/tools"), .source, .target] | @tsv' "$tools/sync/manifest.json")

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

while IFS= read -r target; do
  if [ -n "$target" ]; then
    copied["$target"]=1
  fi
done <<< "$copied_targets"

rows=$(
  git -C "$tools" log --format=%H -- sync/manifest.json | while IFS= read -r commit; do
    git -C "$tools" show "$commit:sync/manifest.json" |
      jq -r '.[] | .name as $name | .files[]
        | [.target, $name, (.repo // "zgeoff/tools"), .source] | @tsv'
  done | sort -u
)

while IFS=$'\t' read -r target name repo source; do
  if [ -z "$target" ] || [ -n "${current[$target]:-}" ]; then
    continue
  fi
  entries["$target"]+="$name"$'\n'
  sources["$target"]+="$repo"$'\t'"$source"$'\n'
  if [ -n "${moved[$name$'\t'$repo$'\t'$source]:-}" ]; then
    renamed["$target"]="${moved[$name$'\t'$repo$'\t'$source]}"
  fi
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
  if [ -n "${renamed[$target]:-}" ] && [ -n "${copied[${renamed[$target]}]:-}" ]; then
    rm -f -- "$target"
    printf '%s\n' "$target"
    continue
  fi
  delivered=$(
    printf '%s' "${sources[$target]}" | sort -u | while IFS=$'\t' read -r repo source; do
      checkout=$(checkout_of "$repo")
      if [ -z "$checkout" ]; then
        continue
      fi
      git -C "$checkout" log --format=%H -- "$source" | while IFS= read -r commit; do
        if blob=$(git -C "$checkout" rev-parse -q --verify "$commit:$source"); then
          print_delivered_hashes "$checkout" "$target" "$blob"
        fi
      done
    done
  )
  copy="$target"
  if grep -qxF "$(to_delivered_form "$target" < "$copy" | git hash-object --stdin)" <<< "$delivered"; then
    rm -f -- "$target"
    printf '%s\n' "$target"
  fi
done < <(printf '%s\n' "${!entries[@]}" | sort)
