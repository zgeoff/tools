#!/usr/bin/env bash
# Reads a manifest entry's `files` array on stdin and prints one row per file
# for the repo: the action, source, target and mode, separated by tabs. The
# action is `skip` when the file's `except` list names the repo, and `copy`
# otherwise. GitHub repo names ignore case, so the match does too.
# Usage: select-sync-files.sh <owner/repo>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: select-sync-files.sh <owner/repo>" >&2
  exit 2
fi

jq -r --arg repo "$1" \
  '($repo | ascii_downcase) as $repo
   | .[]
   | (if (.except // []) | map(ascii_downcase) | index($repo) then "skip" else "copy" end) as $action
   | [$action, .source, .target, (.mode // "0644")]
   | @tsv'
