# Workflow lint

This reference lists each warning of the workflow lint, the terms its rules use, and how it picks
the repo's profile. The lint checks the rules in the [ci-design skill](../SKILL.md) that a parser
can check exactly. It prints each fault as a warning and exits 0, so a warning never fails a run. No
comment or setting silences a warning: change the workflow until the warning clears. To check a
change, commit it and run `bun x chex workflows`, which reads the workflows that HEAD holds.

Each rule lives in
[`run-workflows-check.ts`](https://github.com/zgeoff/tools/blob/main/packages/chex/src/run-workflows-check.ts).
A change to a rule's message changes the matching line here in the same pull request, and a test
fails until it does.

## Terms

The rules use these terms. A group is a `concurrency` group, at the workflow level or on a job.

- **A release, deploy or migrate job** has `release`, `deploy` or `migrate` anywhere in its id or
  its name, in upper or lower case, so a job named `deployment-preview` counts.
- **A cancelling group** sets `cancel-in-progress: true`.
- **A checks workflow** has a `pull_request` or a `push` trigger. A workflow with only a
  `pull_request_target` trigger is not one.
- **A gate on main** is a checks workflow whose `push` trigger lists only `main` in `branches:`, and
  which has no `pull_request` or `pull_request_target` trigger.
- **A gate group** is a group in a gate on main that holds `github.sha` and sets
  `cancel-in-progress: false` or leaves the key out. The lint takes it in place of a cancelling
  group.
- **A heavy check** is a job whose `runs-on` holds a label that does not start with `ubuntu-`, such
  as a macOS, Windows or self-hosted label, or a job with a step that runs a KVM (kernel-based
  virtual machine) setup command.

Each zgeoff repo that runs KVM has its own setup command. A KVM job runs on an Ubuntu label, so the
lint finds it by that command, and `kvmSetupCommands` in `run-workflows-check.ts` lists each one by
its command name, such as a script path or a package script name. A repo with a new setup command
adds its name to that list in zgeoff/tools.

The lint reads a step's commands with the parser in
[`collect-command-names.ts`](https://github.com/zgeoff/tools/blob/main/packages/chex/src/collect-command-names.ts).
A step that the parser cannot read, such as one with a command substitution, counts as no KVM setup.
A `runs-on` that holds an expression is never heavy, because GitHub resolves it only when the job
runs.

## Warnings

The lint warns on each of these. Each bullet ends with the lint's message, with `…` for the parts
that name a job, a step or a value.

- [One command per `run:`](../SKILL.md#step-scripts): a `run:` that breaks the rule. A `;`, `|` or
  `&&` inside quotes is part of a word, and gets no warning.
  `job …, …: the run …; a run holds one command on one line, and anything more goes in a script`
- [Timeouts](../SKILL.md#timeouts): a job without `timeout-minutes`. A job that calls a reusable
  workflow gets no warning, because GitHub refuses the key there. `job … sets no timeout-minutes`
- [Two profiles](../SKILL.md#two-profiles): a heavy check in a workflow with a `pull_request` or
  `pull_request_target` trigger, in a private repo.
  `job … is a heavy check, because it …, in a workflow that runs on …; a private repo runs a heavy check nightly or on dispatch, never on each pull request`
- [Build once](../SKILL.md#build-once): an `actions/cache` step that caches `~/.bun/install/cache`
  or `node_modules` in a job that sets up Bun with `oven-sh/setup-bun`.
  `job …, …: a Bun job caches … with …; bun install --frozen-lockfile runs faster than the cache restore`
- [Checkout depth](../SKILL.md#checkout-depth): an `actions/checkout` step with `fetch-depth: 0` and
  no `filter`. Set `filter: blob:none`. A job that walks every past version of a file sets
  `filter: ''` instead, because a blobless clone fetches each old file on its own. The lint takes
  either value as the job's stated choice.
  `job …, …: a checkout with fetch-depth: 0 sets filter: blob:none to clone the history without the file contents, or filter: '' when the job reads many old files`
- [No rebase churn](../SKILL.md#no-rebase-churn): a `workflow_run` trigger without a `branches:`
  filter.
  `the workflow_run trigger has no branches filter, so a run of the named workflow on any branch starts it`

The [Cancelling runs](../SKILL.md#cancelling-runs) rule gives five warnings:

- A checks workflow with no release, deploy or migrate job, when neither its workflow-level group
  nor the group on every job is a cancelling group or a gate group.
  `a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel`
- A checks workflow with a release, deploy or migrate job: each other job without its own cancelling
  group or gate group.
  `job … runs in a checks workflow beside a release or deploy job, so it sets a job-level concurrency group with cancel-in-progress: true`
- A release, deploy or migrate job without its own group that sets `cancel-in-progress: false`.
  `job … releases or deploys, so it sets a job-level concurrency group with cancel-in-progress: false`
- A workflow-level cancelling group in a workflow that holds a release, deploy or migrate job.
  `the workflow-level cancel-in-progress: true can cancel job …, which releases or deploys; set each concurrency group per job`
- A group in a checks workflow that holds `github.sha`, `github.run_id`, `github.run_number` or
  `github.run_attempt`. A gate group may hold `github.sha`.
  `the concurrency group holds …, so no newer run cancels this one`

## Profile

The heavy-check rule applies only to a private repo. The lint reads the profile from the
`CHECKS_PROFILE` environment variable, which takes `public` or `private`. `bun-checks.yml` sets it
from the calling repo's visibility, so a repo that calls `bun-checks.yml` sets nothing. A workflow
that runs the lint without `bun-checks.yml` sets it in the lint step's `env:`. When the variable is
unset, the lint asks `gh repo view` whether the repo is private. When `gh` cannot answer, the lint
applies the rule and prints why.
