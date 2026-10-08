#!/usr/bin/env bash
# Checks sync/manifest.json against the rules the repo-sync workflow assumes:
# unique entry names, a source file for every item, the repo-sync marker on
# every source whose target is a workflow, a string `build` when present, and
# every file under sync/skills/<name>/ listed by the entry that ships that skill.
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
  done < <(find sync/skills -type f | sort)
fi

exit "$errors"
