# Results: one skills folder for Claude Code and Codex

The spike asks where a zgeoff repo should keep its agent skills so that Claude Code, Codex and other
agents read one copy. Codex and four other agents read `.agents/skills/`, and Claude Code reads only
`.claude/skills/`. Both agents follow a symlink from one folder to the other. The spike recommends
keeping the files in `.agents/skills/`, with `.claude/skills` a symlink to `../.agents/skills`. Two
parts of zgeoff/tools need a fix before any repo moves: repo-sync, the workflow that copies shared
skills into each repo, and `chex links`, the check of relative links in Markdown.

A layout here means which of the two folders holds the skill files, and whether the other folder is
absent, a symlink to the whole folder (a folder link), or a folder of one symlink per skill (a
per-skill link).

Each sentence that states a fact ends with its source:

- [measured]: a command in this spike ran and showed it;
- [read in the code]: the code at this spike's commit holds it;
- [from a record]: a doc, a commit or a pull request records it;
- [guess]: neither, with the run that would settle it.

## Setup

- Claude Code 2.1.294 and Codex CLI 0.160.1 ran on Linux with git 2.43.0 [measured].
- [`probe.sh`](./probe.sh) builds one git repo per layout under a new folder that you name. Each
  repo holds one test skill whose body holds a marker word, such as `probe-folder-ok` [measured].
- The script asks each agent to list its skills whose names start with `probe-`, with no tool call:
  `claude -p --max-turns 1` and `codex exec --sandbox read-only` [measured].
- The vendor docs were read on 2 Nov 2026, the day of the runs.

The run printed:

```text
claude 2.1.294 (Claude Code)
codex codex-cli 0.160.1
claude-only              claude: probe-claude         codex: NONE
agents-only              claude: NONE                 codex: probe-agents
claude-links-folder      claude: probe-folder         codex: probe-folder
claude-links-each-skill  claude: probe-each           codex: probe-each
agents-links-folder      claude: probe-reverse        codex: probe-reverse
agents-links-each-skill  claude: probe-reverse-each   codex: probe-reverse-each
```

## Which folder is the standard, and which agents read it?

This answer decides the folder name.

The [Agent Skills specification](https://agentskills.io) defines what a skill folder holds, and its
guide for agent authors calls `.agents/skills/` "a widely-adopted convention for cross-client skill
sharing" [from a record:
[adding skills support](https://agentskills.io/client-implementation/adding-skills-support)]. Each
agent's docs list these project folders [from a record]:

| Agent          | Project folders it reads                                     | Source                                                                                |
| -------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Claude Code    | `.claude/skills/` only                                       | [skills](https://code.claude.com/docs/en/skills)                                      |
| Codex          | `.agents/skills` from the working folder up to the repo root | [build skills](https://learn.chatgpt.com/docs/build-skills)                           |
| Cursor         | `.agents/skills/`, `.cursor/skills/`, `.claude/skills/`      | [skills](https://cursor.com/docs/context/skills)                                      |
| Gemini CLI     | `.gemini/skills/`, `.agents/skills/`                         | [skills](https://geminicli.com/docs/cli/skills/)                                      |
| GitHub Copilot | `.github/skills`, `.claude/skills`, `.agents/skills`         | [agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |
| OpenCode       | `.opencode/skills`, `.claude/skills`, `.agents/skills`       | [skills](https://opencode.ai/docs/skills/)                                            |

The Claude Code skills page and its changelog never mention `.agents` [from a record]. The probe
agrees for the two agents it ran: Claude Code lists nothing in the `agents-only` repo, and Codex
lists nothing in the `claude-only` repo [measured].

Answer: `.agents/skills/` is the standard folder, and every agent in the table reads it. Claude Code
is the one exception.

## Does Claude Code load skills through a symlinked `.claude/skills`?

This answer decides which folder holds the files and which folder is the symlink.

The Claude Code docs cover a per-skill link: "a `<skill-name>` entry in the enterprise, personal, or
project location can be a symlink to a directory elsewhere on disk" [from a record]. They say
nothing about a folder link [from a record]. The Codex docs say "Codex supports symlinked skill
folders and follows the symlink target" [from a record].

In the probe, both agents list the test skill in all 4 linked layouts [measured]:

| Files in          | The other folder                            | Claude Code lists it | Codex lists it |
| ----------------- | ------------------------------------------- | -------------------- | -------------- |
| `.claude/skills/` | absent                                      | yes                  | no             |
| `.agents/skills/` | absent                                      | no                   | yes            |
| `.agents/skills/` | `.claude/skills`, a folder link             | yes                  | yes            |
| `.agents/skills/` | `.claude/skills/`, holding a per-skill link | yes                  | yes            |
| `.claude/skills/` | `.agents/skills`, a folder link             | yes                  | yes            |
| `.claude/skills/` | `.agents/skills/`, holding a per-skill link | yes                  | yes            |

Claude Code also loaded the test skill through the folder link with its Skill tool, and printed the
skill's marker word [measured].

The `skills` installer (`npx skills add`, the install command in the `zgeoff/skills` README) keeps
its copy in `.agents/skills/` and links each agent's folder to it. When `.claude/skills` already
links to `.agents/skills`, it writes no second link [read in the code: `src/installer.ts` of
vercel-labs/skills at `92a9a34`]. `zgeoff/decree` and `zgeoff/sear` hold the installer's layout:
real folders in `.agents/skills/` and a per-skill link for each in `.claude/skills/` [measured:
their git trees].

Answer: yes, through a folder link and through a per-skill link. Keep the files in
`.agents/skills/`, and make `.claude/skills` one folder link to `../.agents/skills`, so that a repo
that gains a skill needs no new link.

## What has to change?

This answer decides the scope of the rollout issue, the issue that moves each repo to the new
layout.

### repo-sync

repo-sync reads a manifest in zgeoff/tools that lists each shared file with its target, the path it
takes in a repo. Its workflow copies each file to its target with the `install` command, deletes
each retired copy (a copy whose target the manifest no longer lists), and opens one pull request. It
turns on auto-merge only when every path the pull request changes is a target it copied or a retired
copy it deleted. One more change also qualifies: a `package.json` change that only sets the scripts
the manifest declares [read in the code: `scripts/repo-sync/write-sync-auto-merge.ts` and
`collect-undelivered-paths.ts`].

In a repo where `.claude/skills` is a folder link, `install` writes the target
`.claude/skills/testing/SKILL.md` through the link, and git stages the file as
`.agents/skills/testing/SKILL.md` [measured]. The auto-merge check, `collectUndeliveredPaths`, then
reports `.agents/skills/testing/SKILL.md` as a path repo-sync did not copy [measured]. So each skill
pull request in such a repo would wait for review [read in the code]. repo-sync needs to resolve
each target and each retired copy through the repo's symlinks before it compares the paths.

The manifest targets can stay under `.claude/skills/`, because the link resolves them [measured].
Moving the targets to `.agents/skills/` could lose files in a repo with the link. The old
`.claude/skills` targets would become retired copies, and deleting one through the link deletes the
`.agents/skills` file that the same run just wrote [guess: a repo-sync test that moves one target
behind a folder link settles it].

### chex

`chex links` checks every relative link in a repo's Markdown. It skips the shared docs-writing and
skill-writing skills, whose example links point at files that do not exist. It skips them only under
`.claude/skills/` [read in the code: `packages/chex/src/docs/check-links.sh`]. In a probe repo with
docs-writing under `.agents/skills/`, `check-links.sh` exits 1 on that skill's example link
[measured]. `chex skill`, `chex prose` and `chex length` already read `.agents/skills/` [read in the
code], and `chex skill .claude/skills/<name>` works through the link [measured].

### The skill gate

The skill gate is an agent hook from `@zgeoff/agent-hooks` that denies an edit or a tool call until
the agent has loaded the skills that `.claude/skill-gate.json` names. It finds skills under
`.claude/skills`, and its glob follows links [read in the code: `read-available-skills.ts`]. Its
tests already cover a `.claude/skills` link to `.agents/skills` under Codex [read in the code:
`run-skill-gate.test.ts`].

One gap remains. A rule can also require that the agent read a reference file of a skill before a
tool call, and the gate counts that read only at the file's `.claude/skills` path [read in the code:
`plan-tool-gate.ts`]. A Claude Code read of the same file at its `.agents/skills` path does not
count [read in the code].

### tools' own files

tools keeps `code-style` in a real `.claude/skills/code-style/` and links
`.claude/skills/docs-writing` to `sync/skills/docs-writing` [measured]. The `skill-code-style`
manifest entry lists `.claude/skills/code-style/SKILL.md` as its source [read in the code]. These
files describe `.claude/skills` as the place skills live [read in the code]:

- `AGENTS.md`;
- the Skills section of `docs/architecture/repo-sync.md`;
- `docs/guides/skill-gate-codex.md` and `docs/guides/skill-gate-rules.md`;
- step 6 of `docs/runbooks/downstream-repo-setup.md`;
- the `chex skill` example in `sync/skills/skill-writing/SKILL.md`.

Each path still resolves through the link, so none of them breaks [measured: the probe's folder
link]. Each changes so that it names the folder that holds the files.

### Other repos

12 zgeoff repos besides tools keep their skills in a real `.claude/skills/` and have no
`.agents/skills` [measured: the GitHub tree of every zgeoff repo]. Each one moves the folder to
`.agents/skills/`, adds the folder link, and changes its AGENTS.md lines that name
`.claude/skills/`. Three more repos hold both folders [measured]:

- `osrs` keeps its files in `.claude/skills/` and links `.agents/skills` to it, so it swaps the two.
- `decree` and `sear` keep the installer's files in `.agents/skills/` and their own skills in
  `.claude/skills/`, so each moves its own skills and replaces the per-skill links with one folder
  link.

`zgeoff/skills` publishes the shared skills, and its `AGENTS.md`, `skill-writing` and `cold-read`
already give `.agents/skills/<skill>/` paths [measured: GitHub code search]. Those paths resolve in
a repo once the repo moves [read in the code].

Answer: tools changes first (repo-sync, `chex links`, the gate's reference reads, its own folder and
its docs). Then each repo moves its folder, in any order.

## Do Windows checkouts or CI jobs break on symlinks?

This answer decides between symlinks and copies.

A code search finds `windows-latest` and `runs-on: windows` in no zgeoff repo, and all 20 jobs in
tools run on `ubuntu-latest` [measured]. tools already commits 4 symlinks and `osrs` commits a
folder link, and both check out on Linux runners [measured]. GitHub's Windows runner image installs
Git with symlinks on [from a record: `images/windows/scripts/build/Install-Git.ps1` in
actions/runner-images].

Git for Windows turns symlinks off by default, and git then checks a link out as "small plain files
that contain the link text" [from a record: [git-config](https://git-scm.com/docs/git-config),
[Git for Windows](https://gitforwindows.org/symbolic-links.html)]. A clone with
`core.symlinks=false` wrote `.claude/skills` as a 17-byte file that holds `../.agents/skills`
[measured]. Claude Code would then find no project skill, and Codex would still read
`.agents/skills/` [guess: a run in that clone settles it]. Whether any zgeoff checkout runs on
native Windows, outside WSL, is unknown [guess: the owner's answer settles it]. Git for Windows
documents `git clone -c core.symlinks=true` for such a checkout, with Developer Mode on [from a
record].

Answer: symlinks. Every CI job checks out on Linux, and a Windows checkout can turn symlinks on.

## Options

| Layout                                                                   | Effort                                                  | Risk                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Files in `.agents/skills/`, `.claude/skills` a folder link (recommended) | four small tools PRs, then one small PR per repo        | Claude Code relies on the link; a Windows checkout without symlinks loses it     |
| Files in `.agents/skills/`, a per-skill link in `.claude/skills/`        | the same, and a new link each time a repo gains a skill | repo-sync has to write links; a missed link hides a skill from Claude Code only  |
| Files in `.claude/skills/`, `.agents/skills` a folder link               | one link per repo, no tools change                      | Codex and Gemini CLI rely on the link; the files sit outside the standard folder |
| Copies in both folders                                                   | repo-sync writes each file twice                        | the two copies drift, and chex checks each skill twice                           |

The recommended layout keeps the one copy where the standard and five of the six agents look,
matches the `skills` installer, and leaves only Claude Code on the link, which its docs and the
probe both show it follows. Files in `.claude/skills/` with an `.agents/skills` folder link cost
less today, and `osrs` already uses that layout.

These would change the pick:

- Claude Code starts to read `.agents/skills`: the link goes, and nothing else changes.
- A checkout on native Windows without symlinks turns out to matter: files in `.claude/skills/` keep
  Claude Code working there.
- The four tools follow-ups prove costly: files in `.claude/skills/` need none of them.

## Untested

- A checkout on native Windows. The Linux clone with `core.symlinks=false` stands in for it.
- The `skills` installer against a folder link. The spike read its source and never ran it.
- Cursor, Gemini CLI, Copilot and OpenCode following a symlinked folder. The spike read only their
  docs.
- Claude Code in an interactive or cloud session with the folder link. Only `claude -p` ran.
- Moving the manifest targets to `.agents/skills/` behind a folder link. The repo-sync risk of that
  move stays a guess until a test runs it.

## Follow-ups

1. tools: resolve copied and retired paths through the repo's symlinks in repo-sync, with a test for
   a `.claude/skills` folder link.
2. tools: skip the docs-writing and skill-writing skills under `.agents/skills/` in `chex links`.
3. tools: count a reference read at either skills path in the skill gate.
4. tools: move its own skills to `.agents/skills/`, link `.claude/skills`, and change the
   `skill-code-style` source and the docs that name the folder.
5. Every other repo that holds skills: move the folder, add the link, and change AGENTS.md.
