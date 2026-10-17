#!/usr/bin/env bash
# Merges the open release PR once every check on its head commit has passed.
# No branch protection enforces the release PR's checks, so this script waits
# for them. It reads the head commit from the branch ref, not the PR, on each
# poll: the release job pushes a sync commit just before this runs, and the PR
# can still name the old head, whose checks already passed. A head with no
# checks yet counts as pending, because GitHub starts them a few seconds after
# the push. The merge names the checked commit, so a later push can't slip in.
# Usage: merge-release-prs.sh <owner/repo>
# Env: CHECKS_TIMEOUT, the seconds to wait for the checks (default 900);
#      POLL_INTERVAL, the seconds between polls (default 10).
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: merge-release-prs.sh <owner/repo>" >&2
  exit 2
fi

repo=$1
branch=release-please--branches--main
timeout=${CHECKS_TIMEOUT:-900}
interval=${POLL_INTERVAL:-10}

pr=$(gh pr list --repo "$repo" --head "$branch" --json number | jq -r '.[0].number // empty')
if [ -z "$pr" ]; then
  echo "no open release PR"
  exit 0
fi

# One query returns the branch head and the checks on it, so the two always
# match. It reads the same status rollup as `gh pr checks`: check runs from
# GitHub Actions and other apps, and commit statuses from services that use
# the older statuses API.
# shellcheck disable=SC2016 # GraphQL variables, not shell ones
query='query($owner: String!, $name: String!, $ref: String!) {
  repository(owner: $owner, name: $name) {
    ref(qualifiedName: $ref) {
      target {
        oid
        ... on Commit {
          statusCheckRollup {
            contexts(first: 100) {
              nodes {
                __typename
                ... on CheckRun { name status conclusion checkSuite { app { slug } } }
                ... on StatusContext { context state }
              }
            }
          }
        }
      }
    }
  }
}'
# Prints the head commit, then one line per check: pass, pending, or
# fail:<name>, plus an "actions" line per GitHub Actions check. A head with no
# checks yet has a null rollup and prints no lines.
filter='.data.repository.ref.target
  | (.oid // error("no release branch")),
    (.statusCheckRollup.contexts.nodes // [] | .[]
      | if .__typename == "CheckRun" then
          (if .checkSuite.app.slug == "github-actions" then "actions" else empty end),
          if .status != "COMPLETED" then "pending"
          elif (.conclusion | IN("SUCCESS", "NEUTRAL", "SKIPPED")) then "pass"
          else "fail:" + .name end
        elif (.state | IN("PENDING", "EXPECTED")) then "pending"
        elif .state == "SUCCESS" then "pass"
        else "fail:" + .context end)'

deadline=$((SECONDS + timeout))
sha=unknown
while :; do
  # A failed read counts as a pending poll, so one API error doesn't end the
  # wait, and the deadline still bounds it.
  if head=$(gh api graphql -f owner="${repo%%/*}" -f name="${repo#*/}" \
    -f ref="refs/heads/$branch" -f query="$query" | jq -r "$filter"); then
    # Expansions and here-strings, not pipes: under pipefail, a reader that
    # exits early, like head or grep -q, can fail the pipe with SIGPIPE.
    sha=${head%%$'\n'*}
    states=${head#"$sha"}
    states=${states#$'\n'}
  else
    states=pending
  fi
  failed=$(sed -n 's/^fail://p' <<< "$states" | awk 'NR > 1 { printf ", " } { printf "%s", $0 }')
  if [ -n "$failed" ]; then
    echo "release PR #$pr has failing checks on $sha: $failed" >&2
    exit 1
  fi
  # Other apps' checks, such as a review bot's status, can pass before
  # GitHub Actions creates this repo's own checks, so wait for those too.
  if grep -qx actions <<< "$states" && ! grep -qx pending <<< "$states"; then
    break
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "release PR #$pr checks on $sha did not finish within ${timeout}s" >&2
    exit 1
  fi
  sleep "$interval"
done

# Mergeability is recomputed asynchronously after a push, so poll until it
# settles. A MERGEABLE read can be stale ("Base branch was modified" from the
# merge mutation), so the merge itself retries inside the same loop.
for _ in $(seq 1 12); do
  state=$(gh pr view "$pr" --repo "$repo" --json mergeable | jq -r .mergeable)
  if [ "$state" = "CONFLICTING" ]; then
    echo "release PR #$pr has conflicts" >&2
    exit 1
  fi
  if [ "$state" = "MERGEABLE" ] \
    && gh pr merge "$pr" --repo "$repo" --squash --match-head-commit "$sha"; then
    echo "merged release PR #$pr at $sha"
    exit 0
  fi
  sleep "$((interval < 5 ? interval : 5))"
done

echo "release PR #$pr never became mergeable" >&2
exit 1
