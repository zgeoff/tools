# Releasing

Releases are fully automated off `main` via
[release-please](https://github.com/googleapis/release-please) (manifest mode) plus an OIDC npm
publish step in `.github/workflows/main.yml`. No npm tokens live in CI. Decision record:
[#8](https://github.com/zgeoff/tools/issues/8).

## Flow

1. A `feat:`/`fix:` PR touching `packages/<pkg>` merges to `main`.
2. `main.yml` runs release-please, which opens (or updates) a release PR for the affected packages:
   version bump per conventional-commit type, `CHANGELOG.md`, manifest update. The job syncs
   `bun.lock` on the PR branch (versions are recorded there too) and auto-merges the PR.
3. The merge triggers `main.yml` again: release-please tags `@zgeoff/<pkg>@X.Y.Z`, creates the
   GitHub release, and the publish step runs `bun pm pack` (resolves `catalog:`/`workspace:` to
   exact versions — never pack with npm) then `npm publish <tarball> --provenance` under OIDC.

Packages with `"private": true` are versioned but skipped by the publish step. Internal `workspace:`
dependents of a released package get a patch bump automatically (`node-workspace` plugin).

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
- `npm publish` 404/403 on a package's first CI release: trusted publisher not configured for that
  package, or the first manual publish never happened.
- Version bumps feel off pre-1.0: intentional — `feat:` bumps patch and breaking changes bump minor
  until 1.0 (`bump-patch-for-minor-pre-major`, `bump-minor-pre-major`).
