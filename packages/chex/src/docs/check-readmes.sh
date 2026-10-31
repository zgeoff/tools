#!/usr/bin/env bash
# Fails on each README.md that is not one of the five kinds in references/readmes.md, and prints
# what to do with it. Its last line counts the READMEs and those of no kind.
# Usage (from the repo root): check-readmes.sh
# The five kinds:
# 1. the root README.md;
# 2. a README in a folder that holds a package.json, go.mod or Cargo.toml;
# 3. docs/README.md;
# 4. a design README: docs/design/<work>/README.md, or the README of a folder inside a design folder
#    whose own README is a design README, outside any spikes/ folder;
# 5. a spike README, whose first H1 starts "Spike: ", or, outside docs/design/, the README of a
#    folder whose direct subfolders hold a spike README. A design README lists its own spikes.
# A README git marks linguist-vendored belongs to someone else and is skipped.
set -uo pipefail

if [ "$#" -gt 0 ]; then
  echo "usage: check-readmes.sh" >&2
  exit 2
fi

# Lists tracked and untracked READMEs, so a new README is checked before it is staged. A file deleted
# from the working tree stays in the index until the deletion is staged, so it is dropped here.
readmes=()
while IFS= read -r file; do
  [ -f "$file" ] && readmes+=("$file")
done < <(git -c core.quotePath=false ls-files --cached --others --exclude-standard -- \
  ':(glob)**/README.md' ':(exclude,attr:linguist-vendored)' \
  ':(exclude,attr:linguist-vendored=true)' | sort -u)

declare -A listed=()
for readme in "${readmes[@]}"; do
  listed[$readme]=1
done

# Holds when the first H1 outside a code block starts "Spike: ".
is_spike() {
  awk '
    /^[ \t]*(```|~~~)/ { open = !open; next }
    !open && /^# / { found = ($0 ~ /^# Spike: /); exit }
    END { exit !found }
  ' "$1"
}

# Holds when a README in one of the folder's direct subfolders is a spike README.
indexes_spikes() {
  local dir=$1 readme
  for readme in "${readmes[@]}"; do
    if [[ $readme == "$dir"/*/README.md && $readme != "$dir"/*/*/README.md ]] && is_spike "$readme"; then
      return 0
    fi
  done
  return 1
}

is_design() {
  local readme=$1 parent
  [[ $readme == docs/design/*/README.md && /$readme/ != */spikes/* ]] || return 1
  [[ $readme != docs/design/*/*/README.md ]] && return 0
  parent=$(dirname "$(dirname "$readme")")/README.md
  [ -n "${listed[$parent]:-}" ] && is_design "$parent"
}

is_known() {
  local readme=$1 dir
  dir=$(dirname "$readme")

  [ "$readme" = README.md ] && return 0
  [ -f "$dir/package.json" ] || [ -f "$dir/go.mod" ] || [ -f "$dir/Cargo.toml" ] && return 0
  [ "$readme" = docs/README.md ] && return 0
  is_design "$readme" && return 0
  is_spike "$readme" && return 0
  [[ $dir != docs/design/* ]] && indexes_spikes "$dir"
}

unknown=0
for readme in "${readmes[@]}"; do
  if ! is_known "$readme"; then
    unknown=$((unknown + 1))
    echo "$readme: not one of the five kinds of README; move its content into docs/, or into a code comment beside the code it explains"
  fi
done

echo "check-readmes: ${#readmes[@]} READMEs, $unknown not one of the five kinds"
[ "$unknown" -eq 0 ]
