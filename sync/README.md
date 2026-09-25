# sync

Files every downstream repo carries a copy of. [`manifest.json`](./manifest.json) lists them as
entries, and the [repo-sync workflow](../.github/workflows/repo-sync.yml) delivers each entry to a
downstream repo as one pull request on the branch `sync/<name>`. [`repo-sync.yml`](./repo-sync.yml)
is the stub a downstream repo installs to call it.

## Manifest entries

An entry holds:

- `name` — the branch suffix and the name that `skip` and `include` take.
- `description` — one line, which the workflow writes into the pull request body.
- `files` — `source` (a path in this repo), `target` (a path in the downstream repo), and an
  optional `mode` such as `0755`. The workflow copies each file verbatim.
- `optIn` (optional) — `true` delivers the entry only to a repo whose stub lists it in `include`.
- `build` (optional) — a bash command the workflow runs in the downstream checkout after the copy,
  for a file that is generated from a copied one. The runner has bash, git and jq, and nothing from
  the downstream repo's toolchain is installed, so the command uses those only.

A target under `.github/workflows/` needs the line `repo-sync delivers this file from zgeoff/tools`
in its source. Without it, the workflow never overwrites a workflow file the repo wrote itself.
`scripts/check-sync-manifest.sh` checks these rules in CI.

Files under [`workflow-callers/`](./workflow-callers/) are opt-in entries: each is a short workflow
that calls a reusable workflow in this repo, and a repo lists the ones it runs in the stub's
`include` input. A caller reads repo-specific values from repo variables, which its header comment
names, since the copy itself is verbatim. `workflow-bun-pr` runs
[`bun-checks.yml`](../.github/workflows/bun-checks.yml), the standard Bun pull-request checks.

A sync branch is force-pushed on every run, so a commit a person adds to it is lost on the next run.
Edit the source here instead.

## Wiring up a downstream repo

1. Install the repo-sync GitHub App on the repo, and set the `REPO_SYNC_APP_CLIENT_ID` and
   `REPO_SYNC_APP_PRIVATE_KEY` repo secrets from the `repo-sync-github-app` item in the `zgeoff`
   1Password vault:

   ```sh
   gh secret set REPO_SYNC_APP_CLIENT_ID -R zgeoff/<repo> --body "$(op read 'op://zgeoff/repo-sync-github-app/client-id')"
   op read 'op://zgeoff/repo-sync-github-app/private-key' | gh secret set REPO_SYNC_APP_PRIVATE_KEY -R zgeoff/<repo>
   ```

2. Add `agents/project.md` with the repo's own rules, and add `agents/shared.md` and `AGENTS.md` to
   the repo's formatter ignore list, since both arrive formatted by this repo's settings.
3. Copy [`repo-sync.yml`](./repo-sync.yml) to `.github/workflows/repo-sync.yml`.
4. Dispatch it once: `gh workflow run repo-sync.yml -R zgeoff/<repo>`. Expect one pull request per
   entry the repo is behind on.
5. Add a drift check to the repo's CI, so a hand edit to `AGENTS.md` fails the build:

   ```yaml
   - run: bash scripts/build-agents-md.sh agents/shared.md agents/project.md AGENTS.md
   - run: git diff --exit-code AGENTS.md
   ```
