#!/usr/bin/env bash
# Lints the pull request's title with commitlint and the shared rules of @zgeoff/commitlint-config.
# It installs both into the runner's temp folder, so the repo needs no install. A squash merge
# makes the title the commit subject, so the rules are the ones that chex commits applies.
# Usage: lint-pr-title.sh
# Env: PR_TITLE; COMMITLINT_CLI and COMMITLINT_CONFIG, the pinned packages; RUNNER_TEMP.
set -euo pipefail

folder="$RUNNER_TEMP/commitlint"

mkdir -p "$folder"

(cd "$folder" && npm install --no-save --ignore-scripts --no-audit --no-fund "$COMMITLINT_CLI" "$COMMITLINT_CONFIG")

echo "export default { extends: ['@zgeoff/commitlint-config'] };" > "$folder/commitlint.config.mjs"

if ! printf '%s' "$PR_TITLE" | "$folder/node_modules/.bin/commitlint" --config "$folder/commitlint.config.mjs" --color=false; then
  echo 'Rename the PR title to a Conventional Commit in the imperative mood, such as "fix(api): retry a refused upload".' >&2
  exit 1
fi
