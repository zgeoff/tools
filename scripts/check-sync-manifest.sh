#!/usr/bin/env bash
# Checks sync/manifest.json against the rules the repo-sync workflow assumes:
# unique entry names, a source file for every item, the repo-sync marker on
# every source whose target is a workflow, a string `build` when present, an
# `except` that lists owner/repo names, no link to an excepted file outside a
# block that needs it, and every file under sync/skills/<name>/ listed by the
# entry that ships that skill, except the tests, which stay here.
# Usage: check-sync-manifest.sh [manifest]
set -euo pipefail

manifest="${1:-sync/manifest.json}"
marker='repo-sync delivers this file from zgeoff/tools'
errors=0

report() {
  echo "check-sync-manifest: $1" >&2
  errors=1
}

duplicates=$(jq -r '[.[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' "$manifest")

for name in $duplicates; do
  report "entry name '$name' appears more than once"
done

while IFS=$'\t' read -r name kind; do
  report "entry '$name' has a build of type $kind, not string"
done < <(jq -r '.[] | select(has("build") and (.build | type) != "string") | [.name, (.build | type)] | @tsv' "$manifest")

while IFS=$'\t' read -r name source target; do
  if [ ! -f "$source" ]; then
    report "entry '$name' lists source $source, which does not exist"
    continue
  fi

  if [[ "$target" == .github/workflows/* ]] && ! grep -qF "$marker" "$source"; then
    report "entry '$name' targets $target, but $source lacks the line '$marker'"
  fi
done < <(jq -r '.[] | .name as $n | .files[] | [$n, .source, .target] | @tsv' "$manifest")

while IFS=$'\t' read -r name source; do
  report "entry '$name' gives $source an except that is not a list of owner/repo names"
done < <(jq -r '.[] | .name as $n | .files[] | select(has("except"))
  | select((.except | type) != "array"
    or any(.except[]; type != "string" or (test("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$") | not)))
  | [$n, .source] | @tsv' "$manifest")

# A repo that an `except` names gets each Markdown file of the entry without
# the blocks that need the excepted files. A link to such a file outside its
# block would arrive as a dead link, so each Markdown source is stripped as
# the sync strips it and must link no excepted file after that.
scripts_dir=$(dirname "$0")
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

while IFS= read -r name; do
  excluded=()
  while IFS= read -r target; do
    excluded+=("$staging/$name/$target")
  done < <(jq -r --arg name "$name" \
    '.[] | select(.name == $name) | .files[] | select((.except // []) | length > 0) | .target' "$manifest")

  while IFS=$'\t' read -r source target; do
    [ -f "$source" ] || continue
    copy="$staging/$name/$target"
    mkdir -p "$(dirname "$copy")"
    cp "$source" "$copy"

    if ! problem=$(bash "$scripts_dir/remove-excluded-blocks.sh" "$copy" "${excluded[@]}" 2>&1); then
      report "entry '$name' cannot strip $source: ${problem#remove-excluded-blocks: }"
      continue
    fi

    while IFS= read -r link; do
      resolved=$(realpath -m "$(dirname "$copy")/$link")
      for path in "${excluded[@]}"; do
        if [ "$resolved" = "$(realpath -m "$path")" ]; then
          report "entry '$name' links $link from $source outside a 'repo-sync needs $link' block"
        fi
      done
    done < <(grep -oE '\]\([^)#[:space:]]+' "$copy" | sed 's/^](//' | sort -u)
  done < <(jq -r --arg name "$name" \
    '.[] | select(.name == $name) | .files[] | select(.target | endswith(".md")) | [.source, .target] | @tsv' "$manifest")
done < <(jq -r '.[] | select(any(.files[]; (.except // []) | type == "array" and length > 0)) | .name' "$manifest")

# A skill links its references by relative path, so a file the entry omits
# arrives downstream as a dead link. Each entry that ships a file from a skill
# folder must ship the whole folder, since a caller can select it alone.
if [ -d sync/skills ]; then
  while IFS= read -r file; do
    skill=${file#sync/skills/}
    prefix="sync/skills/${skill%%/*}/"
    owners=$(jq -r --arg prefix "$prefix" \
      '.[] | select(any(.files[]; .source | startswith($prefix))) | .name' "$manifest")

    if [ -z "$owners" ]; then
      report "skill folder $prefix holds $file, but no entry lists a file from that folder"
      continue
    fi

    while IFS= read -r name; do
      report "entry '$name' ships $prefix, but omits $file"
    done < <(jq -r --arg prefix "$prefix" --arg file "$file" \
      '.[] | select(any(.files[]; .source | startswith($prefix)))
        | select(any(.files[]; .source == $file) | not) | .name' "$manifest")
  done < <(find sync/skills -type f -not -name '*.test.ts' | sort)
fi

exit "$errors"
