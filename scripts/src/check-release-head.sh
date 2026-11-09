#!/usr/bin/env bash
# Fails while a merged release PR that release-please has yet to tag sits
# behind a main whose workflow files changed since its merge commit. The
# release App's token has no Workflows permission, and GitHub is expected to
# refuse it a tag on such a commit, so the release job stops here with the
# recovery steps instead of an API error. A main that moved with no workflow
# change leaves the tag safe.
# Usage: check-release-head.sh <owner/repo>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: check-release-head.sh <owner/repo>" >&2
  exit 2
fi

repo=$1

pending=$(gh pr list --repo "$repo" --state merged --label 'autorelease: pending' \
  --json number,mergeCommit,baseRefName < /dev/null)

status=0
while read -r pr merge base; do
  head=$(gh api "repos/$repo/commits/$base" < /dev/null | jq -r .sha)
  if [ "$merge" = "$head" ]; then
    continue
  fi
  changed=$(gh api "repos/$repo/compare/$merge...$head" < /dev/null |
    jq -r '[.files[]?.filename | select(startswith(".github/workflows/"))] | join(", ")')
  if [ -z "$changed" ]; then
    echo "release PR #$pr: $base moved from its merge commit $merge to $head with no workflow change; the tag is safe"
    continue
  fi
  echo "release PR #$pr: its merge commit $merge is no longer $base's head $head, and $changed changed since, so the release App cannot tag it; recover with the steps for an untagged release PR in RELEASING.md" >&2
  status=1
done < <(jq -r '.[] | "\(.number) \(.mergeCommit.oid) \(.baseRefName)"' <<< "$pending")

exit "$status"
