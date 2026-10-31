# Agent hooks

Every Claude Code and Codex CLI hook in a zgeoff repo runs the same command: a start-up stub in the
repo, at `.claude/hooks/start.ts`. The stub loads
[`@zgeoff/agent-hooks`](../../packages/agent-hooks/README.md) and hands it the hook payload, and the
package runs its handlers, such as the [skill gate](./skill-gate.md), in order. The stub is the only
part that runs before `bun install`. It installs the package itself when the package is missing, so
an agent can work in a fresh worktree at once. It fails closed: while the package cannot load, it
refuses every tool call but a read-only command.

## One entry per event

Both harnesses run the matching hooks of one event in parallel, so an order between two hooks holds
only inside one command. Each event therefore has one hook entry, the stub, and the package puts its
handlers in order behind it. `agent-hooks init` writes those entries. The `PreToolUse` matcher names
the edit tools, Bash and each tool that a tool gate names, because a harness never runs a hook for a
call that the matcher skips. Under Codex the stub also runs on `UserPromptSubmit` and `PostCompact`,
where the skill gate keeps its ledger of loaded skills.

Each handler takes the payload and the repo context, and returns an allow or a block with a message.
The first block wins: the hook writes its message to stderr and exits 2, and the handlers after it
never run. Both harnesses take exit 2 as a block. Before a tool call, the call never runs. After a
Bash command, the change stays, and the agent gets the message beside the command's output. An allow
can carry JSON output, such as context for the model or a warning for the user, and the hook prints
the first handler's output on stdout.

## The start-up stub

A harness runs the call when a `PreToolUse` hook exits with any status but 2, so a stub that crashed
would let the call through. The stub therefore imports only Node builtins, and it loads the package
with a dynamic import that cannot crash it. The hook command runs Bun with `--no-install`, because
in a checkout with no `node_modules` Bun otherwise fetches a missing package from npm at its latest
version, whatever the lockfile says.

When the import fails, the stub runs `bun install --frozen-lockfile` at the repo root, then runs
itself again in a new process, which reads the payload from the same stdin. The retry is a new
process because Bun can keep a failed package lookup for the life of the process. The retry never
installs, so a failed install ends in the refusal below.

Several hook calls start at once, such as the hooks for parallel tool calls, so the install runs
under a lock file in `node_modules`. The first stub creates the lock with its process id already in
it, so no other stub reads an empty lock. A stub that finds the lock waits until the lock goes, then
imports the package without an install. A harness kills a hook that runs past its timeout, so a lock
counts only while it names a process that runs. Two stubs can both find a lock stale, so a stub
takes, checks or replaces the lock only while it holds a second lock, the guard. The guard's holder
removes the guard itself. When a stopped stub leaves the guard behind, a stub skips the install and
names the guard file to remove. When a stub cannot create a lock file for a reason other than an
existing lock, or cannot read one that exists, it skips the install and reports the error. The lock
does not cover an install that outlives its killed hook, and a second install can then start beside
it.

## Failing closed

When the package still cannot load, the stub reads no rules, because the rules code lives in the
package. It exits 2 before every tool call with `To work here, run bun install.`, unless the call is
a Bash command on a short read-only list: `bun install`, `ls`, `cat` and `pwd`. The list leaves out
git, because git config can make any git command run a program, even a `git diff` with its external
diff and textconv programs turned off: an fsmonitor program or a clean filter. A listed command must
be one command of plain words between single spaces. A shell can build a gated path that no parser
sees, as in `ext=ts; printf x > src/sample.$ext`, so the stub refuses a command with any other
character, such as a variable, a quote, a glob, a redirect, a line break or a control character.

On any other event the stub exits 0. After a tool call there is nothing left to block, and a blocked
prompt would stop a person from asking the agent to run the install.
