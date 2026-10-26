# Releasing

Releases are fully automated off `main` via
[release-please](https://github.com/googleapis/release-please) (manifest mode) plus an OIDC npm
publish step in `.github/workflows/main.yml`. No npm tokens live in CI. Decision record:
[#8](https://github.com/zgeoff/tools/issues/8).

The shared files under `sync/` ship by hand-pushed `sync-vN` tags instead, which
[sync tags](./docs/architecture/sync-tags.md) describes.

## Flow

1. A `feat:`/`fix:` PR touching `packages/<pkg>` merges to `main`.
2. `main.yml`'s release job calls the shared
   [`release-please.yml`](./.github/workflows/release-please.yml), which other repos call at a sync
   tag too. It runs release-please, which opens (or updates) a release PR for the affected packages:
   version bump per conventional-commit type, `CHANGELOG.md`, manifest update. The job syncs
   `bun.lock` on the PR branch (versions are recorded there too) and auto-merges the PR once every
   check on its head passes. `scripts/merge-release-prs.sh` waits up to 15 minutes for those checks
   to start and finish, and fails the run when one fails. When they run longer, it turns on
   auto-merge, so GitHub merges the PR once they pass, and the run of that merge's push tags it.
3. Right after the merge, the same job calls release-please again, which tags `@zgeoff/<pkg>@X.Y.Z`
   on the merge commit and creates the GitHub release. The App token has no Workflows permission, so
   GitHub refuses it the tag once a workflow change lands on `main` after the merge commit; tagging
   at once leaves that change seconds to land, not the length of a checks run.
4. `main.yml`'s publish job dispatches `main.yml` at the tag. The publish job of that run runs
   `bun pm pack` (resolves `catalog:`/`workspace:` to exact versions — never pack with npm) then
   `npm publish <tarball> --provenance` under OIDC.

Packages with `"private": true` are versioned but skipped by the publish step. Internal `workspace:`
dependents of a released package get a patch bump automatically (`node-workspace` plugin).

## Hold a release

The release job leaves a held release PR open: a draft, or one labelled `autorelease: hold`. It
never marks the draft ready, removes the label, or turns on auto-merge for it, and release-please
keeps both when it updates the PR.

To hold a release:

1. Mark the release PR as a draft, or add the label:
   `gh pr edit <number> --add-label 'autorelease: hold'`. The first time, create the label:
   `gh label create 'autorelease: hold'`.
2. If the PR shows auto-merge as on, turn it off: `gh pr merge <number> --disable-auto`.

To release it:

1. Mark the PR ready for review, or remove the label:
   `gh pr edit <number> --remove-label 'autorelease: hold'`.
2. Merge it by hand, or let the release job merge it on the next push to `main` once its checks
   pass.

## One-time setup

### GitHub App (required for the automated chain)

`GITHUB_TOKEN` events don't trigger workflows, so a release PR it creates gets no CI and its merge
would never fire the publish run. The workflow therefore uses a GitHub App token; without it,
release PRs are still created but must be merged by hand.

1. GitHub → Settings → Developer settings → GitHub Apps → New GitHub App. Name it anything (e.g.
   `zgeoff-release`), any homepage URL, uncheck "Active" under Webhook.
2. Repository permissions: Contents → Read and write, Pull requests → Read and write. Save, then
   install the App on `zgeoff/tools`.
3. Generate a private key (downloads a `.pem`). In the repo settings, add:
   - Actions variable `RELEASE_APP_ID` = the App ID
   - Actions secret `RELEASE_APP_PRIVATE_KEY` = the `.pem` contents
4. Repo Settings → Actions → General → check "Allow GitHub Actions to create and approve pull
   requests".

### First publish of a new package (per package)

npm trusted publishing can't create a package that doesn't exist yet, so the first publish is
manual, then OIDC takes over:

```sh
npm login
scripts/first-publish.sh <package-dir>   # e.g. scripts/first-publish.sh format-codemod
```

The script builds, publishes the current version from your machine, and prints the trusted publisher
settings to add on npmjs.com (Access → Trusted Publisher: repo `zgeoff/tools`, workflow `main.yml`).
Once that's saved, CI publishes all future versions with no tokens.

## Troubleshooting

- Release PR open but nothing published: the App isn't configured (or its token step failed) — the
  PR won't auto-merge, and merging it by hand from the GitHub UI works fine and triggers the publish
  run.
- A merged release PR stays untagged, and release-please fails with
  `Resource not accessible by integration`: a workflow change landed on `main` between the release
  PR's merge and its tag. Every later run targets the same merge commit and fails the same way.
  Label the merged release PR `autorelease: tagged` in place of `autorelease: pending`. The next
  releasable commit then opens a release PR for the versions after the untagged ones, which never
  publish.
- `npm publish` 404/403 on a package's first CI release: trusted publisher not configured for that
  package, or the first manual publish never happened.
- Publish fails with `the release tagged <x> but <path>/package.json holds <y>`: the publish step
  checked out a commit other than the one release-please tagged. Republish from the tag, so the
  dispatch checks out the tagged commit, then find out why the checkout differed:

  ```sh
  gh workflow run main.yml --ref '<tag>' -f republish_paths='["<path>"]'
  ```

- Tagged and GitHub-released but the npm publish failed: re-run just the publish via

  ```sh
  gh workflow run main.yml -f republish_paths='["packages/<pkg>"]'
  ```

  Versions already on the registry are skipped, so listing extra paths is safe. Re-running the
  failed job instead won't help when the failure is deterministic — a re-run uses the workflow file
  as of the original commit.

- Version bumps feel off pre-1.0: intentional — `feat:` bumps patch and breaking changes bump minor
  until 1.0 (`bump-patch-for-minor-pre-major`, `bump-minor-pre-major`).
