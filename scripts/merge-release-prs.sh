#!/usr/bin/env bash
# Merges the open release PR once every check on its head commit has passed,
# and leaves it open when the checks outlast the wait.
# No branch protection enforces the release PR's checks, so this script waits
# for them. It reads the head commit from the branch ref, not the PR, on each
# poll: the release job pushes a sync commit just before this runs, and the PR
# can still name the old head, whose checks already passed. A head with no
# checks yet counts as pending, because GitHub starts them a few seconds after
# the push. The merge names the checked commit, so a later push can't slip in.
# After a merge, it writes merged=true to $GITHUB_OUTPUT, so the release job
# can tag the merge in the same run. A held release PR, a draft or one
# labelled "autorelease: hold", stays open: the script reads the hold before
# the wait and again before each merge attempt, and changes neither.
# Usage: merge-release-prs.sh <owner/repo> [<release branch>]
#        (default branch: release-please--branches--main)
# Env: CHECKS_TIMEOUT, the seconds to wait for the checks (default 900);
#      POLL_INTERVAL, the seconds between polls (default 10);
#      GITHUB_OUTPUT, the step's output file (unset: no output).
set -euo pipefail

if [ $# -lt 1 ] || [ $# -gt 2 ]; then
  echo "usage: merge-release-prs.sh <owner/repo> [<release branch>]" >&2
  exit 2
fi

repo=$1
branch=${2:-release-please--branches--main}
timeout=${CHECKS_TIMEOUT:-900}
interval=${POLL_INTERVAL:-10}

# Prints why a release PR is held, or nothing, from its JSON on stdin.
hold_filter='if .isDraft == true then "a draft"
  elif any(.labels[]?; .name == "autorelease: hold") then "labelled autorelease: hold"
  else empty end'

listed=$(gh pr list --repo "$repo" --head "$branch" --json number,isDraft,labels | jq -c '.[0] // empty')
if [ -z "$listed" ]; then
  echo "no open release PR"
  exit 0
fi
pr=$(jq -r .number <<< "$listed")
hold=$(jq -r "$hold_filter" <<< "$listed")
if [ -n "$hold" ]; then
  echo "release PR #$pr is held ($hold); leaving it open"
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
# Prints the head commit, then one line per check: pass, pending:<name>, or
# fail:<name>, plus an "actions" line per GitHub Actions check. A head with no
# checks yet has a null rollup and prints no lines.
filter='.data.repository.ref.target
  | (.oid // error("no release branch")),
    (.statusCheckRollup.contexts.nodes // [] | .[]
      | if .__typename == "CheckRun" then
          (if .checkSuite.app.slug == "github-actions" then "actions" else empty end),
          if .status != "COMPLETED" then "pending:" + .name
          elif (.conclusion | IN("SUCCESS", "NEUTRAL", "SKIPPED")) then "pass"
          else "fail:" + .name end
        elif (.state | IN("PENDING", "EXPECTED")) then "pending:" + .context
        elif .state == "SUCCESS" then "pass"
        else "fail:" + .context end)'

# The clock is a command, not $SECONDS, so a test can set the time.
now() { date +%s; }
deadline=$(($(now) + timeout))
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
    states=pending:
  fi
  failed=$(sed -n 's/^fail://p' <<< "$states" | awk 'NR > 1 { printf ", " } { printf "%s", $0 }')
  if [ -n "$failed" ]; then
    echo "release PR #$pr has failing checks on $sha: $failed" >&2
    exit 1
  fi
  # Other apps' checks, such as a review bot's status, can pass before
  # GitHub Actions creates this repo's own checks, so wait for those too.
  if grep -qx actions <<< "$states" && ! grep -q '^pending:' <<< "$states"; then
    break
  fi
  # Checks that outlast the wait leave the PR open, and the run stays green.
  # Auto-merge waits only for the checks a ruleset requires, so it turns on
  # only when GitHub Actions has created its checks and the base branch's
  # rules require every pending one; otherwise GitHub could merge before a
  # check passes, and the next push to main runs this wait again.
  if [ "$(now)" -ge "$deadline" ]; then
    view=$(gh pr view "$pr" --repo "$repo" --json isDraft,labels,baseRefName)
    hold=$(jq -r "$hold_filter" <<< "$view")
    if [ -n "$hold" ]; then
      echo "release PR #$pr is held ($hold); leaving it open"
      exit 0
    fi
    base=$(jq -r .baseRefName <<< "$view")
    required=$(gh api "repos/$repo/rules/branches/$base" |
      jq -r '.[] | select(.type == "required_status_checks")
        | .parameters.required_status_checks[]?.context')
    unrequired=$(sed -n 's/^pending://p' <<< "$states" |
      awk -v required="$required" 'BEGIN { split(required, names, "\n"); for (i in names) known[names[i]] = 1 }
        !($0 in known) { print $0 == "" ? "(unknown)" : $0 }')
    if ! grep -qx actions <<< "$states" || [ -n "$unrequired" ]; then
      echo "release PR #$pr checks on $sha did not finish within ${timeout}s; a ruleset on $base does not require every pending check, so the next push to $base merges it"
      exit 0
    fi
    echo "release PR #$pr checks on $sha did not finish within ${timeout}s; turning on auto-merge"
    if ! gh pr merge "$pr" --repo "$repo" --auto --squash --match-head-commit "$sha"; then
      echo "release PR #$pr: auto-merge did not turn on; the next push to $base merges it" >&2
    fi
    exit 0
  fi
  sleep "$interval"
done

# Mergeability is recomputed asynchronously after a push, so poll until it
# settles. A MERGEABLE read can be stale ("Base branch was modified" from the
# merge mutation), so the merge itself retries inside the same loop.
for _ in $(seq 1 12); do
  view=$(gh pr view "$pr" --repo "$repo" --json mergeable,isDraft,labels)
  hold=$(jq -r "$hold_filter" <<< "$view")
  if [ -n "$hold" ]; then
    echo "release PR #$pr is held ($hold); leaving it open"
    exit 0
  fi
  state=$(jq -r .mergeable <<< "$view")
  if [ "$state" = "CONFLICTING" ]; then
    echo "release PR #$pr has conflicts" >&2
    exit 1
  fi
  if [ "$state" = "MERGEABLE" ] &&
    gh pr merge "$pr" --repo "$repo" --squash --match-head-commit "$sha"; then
    echo "merged release PR #$pr at $sha"
    echo "merged=true" >> "${GITHUB_OUTPUT:-/dev/null}"
    exit 0
  fi
  sleep "$((interval < 5 ? interval : 5))"
done

echo "release PR #$pr never became mergeable" >&2
exit 1
