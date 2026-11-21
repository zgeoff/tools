#!/usr/bin/env bash
# Checks the pull request's description with chex pr-body. It reads the body from the API, not the
# event payload, so a body that another job edited since the event is the one checked.
# Usage: check-pr-body.sh
# Env: CHEX, the pinned chex package; GH_TOKEN; REPO and PR_NUMBER, the pull request; BASE_SHA and
# HEAD_SHA, its two ends; RUNNER_TEMP, a folder for the body file.
set -euo pipefail

body="$RUNNER_TEMP/pr-body.md"

gh api "repos/$REPO/pulls/$PR_NUMBER" | jq -j '.body // ""' > "$body"

bun x "$CHEX" pr-body --body-file "$body" --base "$BASE_SHA" --head "$HEAD_SHA"
