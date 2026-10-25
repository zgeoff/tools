#!/usr/bin/env bash
# Checks sync/manifest.json against the rules the repo-sync workflow assumes:
# unique entry names, a source file for every item, the repo-sync marker on
# every source whose target is a workflow, a string `build` when present, a
# `scripts` field that matches the package.json scripts the build writes, an
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

# A loop fed by a process substitution ignores the exit status of the jq that
# feeds it, so a manifest that breaks those queries would pass unchecked.
if ! jq -e 'type == "array" and all(.[]; type == "object" and (.name | type) == "string"
  and (.files | type) == "array"
  and all(.files[]; type == "object" and (.source | type) == "string" and (.target | type) == "string"))' \
  "$manifest" > /dev/null; then
  report "$manifest is not a list of entries, each with a string name and a files list of string sources and targets"
  exit "$errors"
fi

duplicates=$(jq -r '[.[].name] | group_by(.) | map(select(length > 1) | .[0]) | .[]' "$manifest")

for name in $duplicates; do
  report "entry name '$name' appears more than once"
done

while IFS=$'\t' read -r name kind; do
  report "entry '$name' has a build of type $kind, not string"
done < <(jq -r '.[] | select(has("build") and (.build | type) != "string") | [.name, (.build | type)] | @tsv' "$manifest")

while IFS= read -r name; do
  report "entry '$name' has a scripts field that is not an object of strings"
done < <(jq -r '.[] | select(has("scripts"))
  | select((.scripts | type) != "object" or any(.scripts[]; type != "string")) | .name' "$manifest")

scripts_dir=$(dirname "$0")
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

# A sync pull request's package.json change may hold only the script lines the
# entry declares, so each build runs on an empty package.json, and the scripts
# it writes there must match the entry's scripts field key for key.
while IFS= read -r name; do
  workdir=$(mktemp -d "$staging/build-XXXXXX")
  echo '{}' > "$workdir/package.json"
  build=$(jq -r --arg name "$name" '.[] | select(.name == $name) | .build // ""' "$manifest")

  if ! problem=$(cd "$workdir" && bash -euo pipefail -c "$build" 2>&1); then
    report "entry '$name' has a build that fails on an empty package.json: $problem"
    continue
  fi

  written='{}'
  if [ -f "$workdir/package.json" ] && ! written=$(jq -ce '.scripts // {}
    | select(type == "object" and all(.[]; type == "string"))' "$workdir/package.json" 2> /dev/null); then
    report "entry '$name' has a build that leaves package.json without a scripts object of strings"
    continue
  fi

  problems=$(jq -r --arg name "$name" --argjson written "$written" '.[] | select(.name == $name)
    | (.scripts // {}) as $declared
    | ($written | to_entries[] | select(.key as $k | $declared | has($k) | not)
      | "has a build that writes script \(.key | tojson) as \(.value | tojson), which its scripts field does not declare"),
      ($written | to_entries[] | select(.key as $k | $declared | has($k) and .[$k] != $written[$k])
      | "declares script \(.key | tojson) as \($declared[.key] | tojson), but its build writes \(.value | tojson)"),
      ($declared | to_entries[] | select(.key as $k | $written | has($k) | not)
      | "declares script \(.key | tojson), which its build never writes")' "$manifest")

  if [ -n "$problems" ]; then
    while IFS= read -r problem; do
      report "entry '$name' $problem"
    done <<< "$problems"
  fi
done < <(jq -r '.[] | select((.build | type) == "string" or has("scripts"))
  | select((.scripts // {}) | type == "object" and all(.[]; type == "string")) | .name' "$manifest")

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
# the blocks that need the files it does not receive. A link to such a file
# outside its block would arrive as a dead link, so each Markdown source the
# repo receives is stripped as the sync strips it for that repo, and must then
# link none of that repo's excepted files.

while IFS=$'\t' read -r name repo; do
  root="$staging/$name/$repo"
  excluded=()
  while IFS= read -r target; do
    excluded+=("$root/$target")
  done < <(jq -r --arg name "$name" --arg repo "$repo" \
    '.[] | select(.name == $name) | .files[]
      | select((.except // []) | map(ascii_downcase) | index($repo)) | .target' "$manifest")

  while IFS=$'\t' read -r source target; do
    [ -f "$source" ] || continue
    copy="$root/$target"
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
          report "entry '$name' links $link from $source outside a 'repo-sync needs $link' block, so $repo gets a dead link"
        fi
      done
    done < <(grep -oE '\]\([^)#[:space:]]+' "$copy" | sed 's/^](//' | sort -u)
  done < <(jq -r --arg name "$name" --arg repo "$repo" \
    '.[] | select(.name == $name) | .files[]
      | select(.target | endswith(".md"))
      | select((.except // []) | map(ascii_downcase) | index($repo) | not)
      | [.source, .target] | @tsv' "$manifest")
done < <(jq -r '.[] | .name as $n
  | [.files[] | .except // [] | select(type == "array") | .[] | strings | ascii_downcase] | unique | .[]
  | [$n, .] | @tsv' "$manifest")

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
