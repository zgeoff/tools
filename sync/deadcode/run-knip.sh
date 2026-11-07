#!/usr/bin/env bash
# Runs knip on the repo that holds this script, with the arguments it gets.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

# knip gives jiti the working directory as a file path, and jiti looks for tsconfig.json from its
# parent, so in a worktree inside another checkout knip reads that checkout's tsconfig. Starting
# knip one folder down makes the search start at the repo root.
cd "$root/node_modules"
exec "$root/node_modules/.bin/knip" --directory "$root" "$@"
