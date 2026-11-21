#!/usr/bin/env bash
# Ticks the chex box of the pull request's Checks section when the docs checks passed, and unticks
# it when they failed. It reads the body from the API now, because the author may have edited it
# since the event, and writes it back only when the text changed. It then fails when the docs
# checks failed, so the run shows why the box is unticked.
# Usage: tick-chex-box.sh
# Env: CHEX, the pinned chex package; GH_TOKEN; REPO and PR_NUMBER, the pull request; DOCS_OUTCOME,
# the outcome of the docs checks step; RUNNER_TEMP, a folder for the body files.
set -euo pipefail

before="$RUNNER_TEMP/body-before.md"
after="$RUNNER_TEMP/body-after.md"

if [ "$DOCS_OUTCOME" = success ]; then
  flag=--passed
else
  flag=--failed
fi

gh api "repos/$REPO/pulls/$PR_NUMBER" | jq -j '.body // ""' > "$before"

bun x "$CHEX" pr-body tick-chex --body-file "$before" "$flag" > "$after"

if ! cmp -s "$before" "$after"; then
  gh pr edit "$PR_NUMBER" --repo "$REPO" --body-file "$after"
fi

if [ "$flag" = --failed ]; then
  echo "The docs checks failed, so the chex box is unticked. Fix what the Check docs step lists." >&2
  exit 1
fi
