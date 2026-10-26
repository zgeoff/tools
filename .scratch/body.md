## Description

tools now shares its release-please job as the reusable `release-please.yml`, which tags a release
PR in the same run that merges it, while the merge commit is still `main`'s head. Before, the tag
waited for the next run's checks, and a workflow change that merged in that gap blocked it, since
the App token has no Workflows permission.

Contributes to GEO-1869

- The shared job covers the App token, release-please, the release PR sync, the merge and the tag.
  It outputs `releases_created`, `tag`, `version` and `release-outputs`.
- Inputs: `app-id`, `merge` (off by default: a person merges), `release-branch` (component releases
  such as atc), `checks-timeout-minutes` (15), `sync-command` (empty skips the repair), and the
  `app-private-key` secret.
- A held release PR (a draft, or labelled `autorelease: hold`) stays open; checks that outlast the
  wait leave the PR open with auto-merge on.
- Before each release-please call that can tag, `check-release-head.sh` fails the job, naming both
  commits, when `main` moved past the merge commit with a workflow change. This narrows the race to
  seconds and fails loudly in them; RELEASING.md gives the recovery.
- tools' `main.yml` calls it with `merge: true` and keeps its own publish and republish job, so
  npm's trusted publisher still names `main.yml`.

## Not changed

- The release App's permissions and installation.
- The release jobs of atc, noslop, auto-mode and impz: each adopts the job in its own PR (see Other
  repos).

## Testing

- `bun test ./scripts/check-release-head.test.ts`: no pending release, merge at head, head moved
  without and with a workflow change, and an auto-merged PR behind a workflow change.
- `bun test ./scripts/merge-release-prs.test.ts`: `merged=true` only after a merge, the branch
  argument, a draft and a labelled hold before and during the wait, and the timeout path: auto-merge
  only when the ruleset requires every pending check, otherwise left open.
- `bun test ./.github/workflows/release-please.test.ts`: runs the real script download step with a
  stub curl, and the pick step for a multi-package, a root-package and an empty release.
- `bun test ./.github/workflows/main.test.ts`: runs the real Resolve and Dispatch steps from the
  shared job's outputs through a stub gh.
- `bun run check:release-workflow`: a static check of the step order, the conditions of the merge,
  post-merge check and tag steps, the tag step's pin, token and `skip-github-pull-request`, and the
  pick step's output source. Its checker takes its reader and writers from the CLI entry and is
  tested in process. pr.yml, main.yml's checks job and the pre-push hook run it.
- `actionlint` on both workflows: only the known `queue` error, which CI ignores.
- `bun run test`: see the latest FINAL note for the count at the head.
- [x] New or changed code has a test, or this section holds the reason it has none

## Acceptance evidence

- Tags after a workflow change lands between merge and job: the shared job tags in the run that
  merges, before any checks, and a workflow change that still lands in those seconds fails the job
  loudly with the recovery steps (tests above). Closing the race fully (holding workflow merges
  behind a pending release) is not in this PR. No test reproduces GitHub's refusal itself: nobody
  can mint the App token here, so the cause stays suspected.
- Fix in the shared release job: `.github/workflows/release-please.yml`, which repos call at a sync
  tag; tools calls it now, the four other repos in their own PRs.
- App permissions unchanged: the diff touches no App setting, and the shared job uses the same token
  and asks for `contents: write` and `pull-requests: write` only.

## Other repos

Each calls the job at the first sync tag that holds it (`@sync-vN` below), in a job that replaces
its release-please steps, with no `needs`, so the push of a release PR's merge reaches the tag at
once. Its ship steps move to a job with `needs: release-please` that reads
`needs.release-please.outputs.releases_created`, `tag`, `version`, or
`fromJSON(needs.release-please.outputs.release-outputs)` for anything else. `merge` stays off unless
the repo merges release PRs without a person today.

- atc, `.github/workflows/main.yml` (merge off: z-release merges):
  ```yaml
  release-please:
    if: github.event_name == 'push'
    permissions: { contents: write, pull-requests: write }
    uses: zgeoff/tools/.github/workflows/release-please.yml@sync-vN
    with:
      app-id: ${{ vars.RELEASE_APP_ID }}
      release-branch: release-please--branches--main--components--@zgeoff/atc
    secrets:
      app-private-key: ${{ secrets.RELEASE_APP_PRIVATE_KEY }}
  ```
- noslop, `.github/workflows/main.yml`: the same with
  `release-branch: release-please--branches--main--components--@noslop/cli`; merge off, as it merges
  by hand today.
- auto-mode, `.github/workflows/main.yml`: the same with no `release-branch`, `merge: true` (it
  auto-merges today) and `sync-command: ''` (it repairs nothing).
- impz, `.github/workflows/ci.yml`: the same with no `release-branch`, merge off (z-release merges),
  and
  `sync-command: bun install && bun run format && { bun run format:check || { bun run format && bun run format:check; }; }`.
  Its "Start the release" step moves to a job that runs
  `gh workflow run release.yml --ref main -f tag="${{ needs.release-please.outputs.tag }}"`. If
  merge is ever turned on, pass `checks-timeout-minutes: 60` for its e2e suite.
- nixie, `.github/workflows/release.yml`: replace its `release-please` job with the call, no
  `release-branch`, merge off (z-release merges) and `sync-command: ''`. Its `resolve` job reads
  `needs.release-please.outputs.releases_created`, `tag`, and
  `fromJSON(needs.release-please.outputs.release-outputs).sha` in place of `release_created`,
  `tag_name` and `sha`.

## Local timeouts

An earlier local `bun run test` timed out at 5 s in 5 tests; later full runs passed them all.

- `sync/pre-push/lefthook-pre-push.test.ts`, the nested `check-length.test.ts` under a worktree
  GIT_DIR: tools#328 fixes it.
- `packages/oxlint-config/module-order.test.ts`: "it fixes what it can and leaves reported a const
  whose binary operator runs an object's valueOf", "it accepts a file with no primary export", "it
  reports a helper above a primary export in an export list", "it fixes a declaration with its
  helper past another helper". Each test starts a real oxlint process, about 0.5 to 0.6 s alone.
  Moving the rule into the test process needs oxlint's `RuleTester`, which refuses to run under Bun,
  so this PR leaves them.
