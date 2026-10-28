import { dirname, join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import type { CopyPlan, ExistingWorkflow, SyncFileRow } from './build-copy-plan.ts';
import { buildCopyPlan } from './build-copy-plan.ts';
import { isWorkflowPath } from './is-workflow-path.ts';
import type { SyncEntry } from './parse-sync-entries.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';
import { selectSyncFiles } from './select-sync-files.ts';

export interface SyncEntriesOptions {
  readonly cwd: string;

  // The whole environment of each command the sync runs, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: FileSystem;

  readonly runCommand: RunCommand;

  // Runs an entry's build, whose output the log shows as the build writes it.
  readonly runLoggedCommand: RunCommand;

  // Receives the step's log: the output of the commands that the log shows, and the error lines.
  readonly writeOutput: (text: string) => void;
}

interface SyncSettings {
  readonly kind: 'parsed';
  readonly entries: readonly SyncEntry[];
  readonly branch: string;
  readonly marker: string;
  readonly pin: string;
  readonly repo: string;
  readonly skip: string;
  readonly workflows: boolean;
  readonly base: string;
}

interface SyncContext extends SyncSettings {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fileSystem: FileSystem;
  readonly runCommand: RunCommand;
  readonly runLoggedCommand: RunCommand;
  readonly writeOutput: (text: string) => void;
}

export async function syncEntries(options: Readonly<SyncEntriesOptions>): Promise<number> {
  const settings = parseSyncSettings(options.env);

  if (settings.kind === 'refused') {
    options.writeOutput(`::error::${settings.message}\n`);

    return 1;
  }

  const context: SyncContext = {
    ...settings,
    cwd: options.cwd,
    env: options.env,
    fileSystem: options.fileSystem,
    runCommand: options.runCommand,
    runLoggedCommand: options.runLoggedCommand,
    writeOutput: options.writeOutput,
  };

  const committed = await commitEntries(context);
  const pushed = await pushSyncBranch(context, committed);

  if (pushed) {
    await writePullRequest(context, committed.synced);
  }

  await removeEntryBranches(context, pushed, committed.failed);

  if (committed.failed.length > 0) {
    options.writeOutput(
      `::error::These entries failed and are not in the sync: ${committed.failed.join(', ')}\n`,
    );

    return 1;
  }

  return 0;
}

type SyncSettingsResult = SyncSettings | { readonly kind: 'refused'; readonly message: string };

function parseSyncSettings(env: Readonly<Record<string, string | undefined>>): SyncSettingsResult {
  const pin = buildPin(env['TOOLS_REF'] ?? '', env['WORKFLOW_REF'] ?? '');

  if (!/^[A-Za-z0-9._/-]+$/u.test(pin)) {
    return {
      kind: 'refused',
      message: `cannot pin delivered workflows to the ref '${pin.replaceAll(':', ' ')}'`,
    };
  }

  const entriesText = env['ENTRIES'] ?? '';
  const entriesJSON = entriesText === '' ? '[]' : entriesText;
  const entriesValue: unknown = JSON.parse(entriesJSON);
  const entries = parseSyncEntries(entriesValue);

  if (entries === null) {
    return { kind: 'refused', message: 'ENTRIES holds no list of manifest entries' };
  }

  return {
    kind: 'parsed',
    entries,
    branch: env['BRANCH'] ?? '',
    marker: env['MARKER'] ?? '',
    pin,
    repo: env['REPO'] ?? '',
    skip: env['SKIP'] ?? '',
    workflows: env['WORKFLOWS'] === 'true',
    base: env['BASE'] ?? '',
  };
}

// A delivered workflow calls this repository at the ref this run syncs from, so a caller pinned to
// a tag never runs the shared jobs of main.
function buildPin(toolsRef: string, workflowRef: string): string {
  const ref = toolsRef === '' ? workflowRef.slice(workflowRef.lastIndexOf('@') + 1) : toolsRef;
  const withoutTags = ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : ref;

  return withoutTags.startsWith('refs/heads/')
    ? withoutTags.slice('refs/heads/'.length)
    : withoutTags;
}

interface SyncedEntry {
  readonly name: string;
  readonly description: string;
}

interface CommittedEntries {
  readonly synced: readonly SyncedEntry[];
  readonly failed: readonly string[];
}

async function commitEntries(context: SyncContext): Promise<CommittedEntries> {
  const synced: SyncedEntry[] = [];
  const failed: string[] = [];
  const taken: string[] = [];
  const copied: string[] = [];

  // The checkout of this repository stays out of every commit.
  await context.fileSystem.appendText(join(context.cwd, '.git/info/exclude'), '/.repo-sync/\n');

  await runSyncCommand(context, [
    'git',
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);

  await runSyncCommand(context, ['git', 'config', 'user.name', 'github-actions[bot]']);
  await runSyncCommand(context, ['git', 'checkout', '-q', '-B', context.branch]);

  for (const entry of context.entries) {
    const written = await writeEntry(context, entry);

    if (written === null) {
      context.writeOutput(`::error::${entry.name} failed, so the sync leaves it out.\n`);

      await runSyncCommand(context, ['git', 'reset', '-q', '--hard']);
      await runSyncCommand(context, ['git', 'clean', '-q', '-f', '-d']);

      failed.push(entry.name);
      continue;
    }

    taken.push(entry.name);
    copied.push(...written);

    await runSyncCommand(context, ['git', 'add', '-A']);

    const staged = await runProbeCommand(context, ['git', 'diff', '--cached', '--quiet']);

    if (staged.exitCode === 0) {
      context.writeOutput(`${entry.name} matches the source; nothing to sync.\n`);
      continue;
    }

    await runSyncCommand(context, [
      'git',
      'commit',
      '-q',
      '-m',
      `chore: sync ${entry.name} from zgeoff/tools`,
    ]);

    synced.push({ name: entry.name, description: entry.description });
  }

  const retired = await removeRetiredFiles(context, taken, copied);

  return retired.kind === 'failed'
    ? { synced, failed: [...failed, retiredFilesName] }
    : { synced: [...synced, ...retired.synced], failed };
}

function runSyncCommand(context: SyncContext, argv: readonly string[]): Promise<CommandResult> {
  return runCheckedCommand(context.runCommand, argv, { cwd: context.cwd, env: context.env });
}

// The build runs in the caller's checkout with the runner's stock tools; the manifest README states
// that contract. The error of a failing copy or build names its path and cause, which the log shows
// before the entry is reset away.
async function writeEntry(context: SyncContext, entry: SyncEntry): Promise<string[] | null> {
  try {
    const copied = await copyEntryFiles(context, entry);

    if (copied === null) {
      return null;
    }

    if (entry.build !== '') {
      const build = await context.runLoggedCommand(
        ['bash', '-euo', 'pipefail', '-c', entry.build],
        {
          cwd: context.cwd,
          env: context.env,
        },
      );

      if (build.exitCode !== 0) {
        context.writeOutput(`::error::${entry.name}: its build exited with ${build.exitCode}\n`);

        return null;
      }
    }

    return copied;
  } catch (error) {
    context.writeOutput(
      `::error::${entry.name}: ${error instanceof Error ? error.message : String(error)}\n`,
    );

    return null;
  }
}

async function copyEntryFiles(context: SyncContext, entry: SyncEntry): Promise<string[] | null> {
  const rows = selectSyncFiles(entry.files, context.repo);

  const existingWorkflows = await readExistingWorkflows(context, rows);

  const plan = buildCopyPlan({ rows, existingWorkflows, marker: context.marker });

  if (plan.conflicts.length > 0) {
    for (const target of plan.conflicts) {
      context.writeOutput(
        `::error file=${target}::${target} is the repo's own workflow, so ${entry.name} does not overwrite it. Move its jobs to a file with another name, or add ${entry.name} to skip.\n`,
      );
    }

    return null;
  }

  await applyCopyPlan(context, plan);

  return plan.copies.map((copy) => copy.target);
}

async function readExistingWorkflows(
  context: SyncContext,
  rows: readonly SyncFileRow[],
): Promise<Map<string, ExistingWorkflow>> {
  const workflows = new Map<string, ExistingWorkflow>();

  for (const row of rows.filter((candidate) => isWorkflowPath(candidate.target))) {
    const target = join(context.cwd, row.target);

    const exists = await context.fileSystem.probePath(target);

    if (exists) {
      const targetText = await context.fileSystem.readText(target);

      const sourceText = await context.fileSystem.readText(
        join(context.cwd, '.repo-sync', row.source),
      );

      workflows.set(row.target, { targetText, sourceText });
    }
  }

  return workflows;
}

async function applyCopyPlan(context: SyncContext, plan: CopyPlan): Promise<void> {
  for (const copy of plan.copies) {
    await context.fileSystem.createDirectory(join(context.cwd, dirname(copy.target)));

    await runSyncCommand(context, [
      'install',
      '-m',
      copy.mode,
      `.repo-sync/${copy.source}`,
      copy.target,
    ]);

    if (copy.isPinned) {
      const path = join(context.cwd, copy.target);

      const text = await context.fileSystem.readText(path);

      await context.fileSystem.writeText(path, buildPinnedWorkflow(text, context.pin));
    }
  }

  for (const target of plan.strippedTargets) {
    await runSyncCommand(context, [
      'bash',
      '.repo-sync/scripts/remove-excluded-blocks.sh',
      target,
      ...plan.excluded,
    ]);
  }
}

function buildPinnedWorkflow(text: string, pin: string): string {
  return text
    .split('\n')
    .map((line) =>
      line.replaceAll(
        /(?<call>zgeoff\/tools\/\.github\/workflows\/[^\]@\s"'{},]+)@main(?<after>[\]{},\s"']|$)/gu,
        `$<call>@${pin}$<after>`,
      ),
    )
    .join('\n');
}

function runProbeCommand(context: SyncContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

const retiredFilesName = 'retired-files';

type RetiredFiles =
  | { readonly kind: 'removed'; readonly synced: readonly SyncedEntry[] }
  | { readonly kind: 'failed' };

// A tools ref from before the retired-file cleanup holds no script for it.
async function removeRetiredFiles(
  context: SyncContext,
  taken: readonly string[],
  copied: readonly string[],
): Promise<RetiredFiles> {
  const script = '.repo-sync/scripts/remove-retired-sync-files.sh';

  const hasScript = await context.fileSystem.probePath(join(context.cwd, script));

  if (!hasScript) {
    context.writeOutput('The tools ref has no retired-file cleanup; nothing to remove.\n');

    return { kind: 'removed', synced: [] };
  }

  const takenList = taken.map((name) => `${name},`).join('');

  const result = await runProbeCommand(context, [
    'bash',
    script,
    '.repo-sync',
    takenList,
    context.skip,
    copied.join('\n'),
  ]);

  context.writeOutput(result.stderr);

  if (result.exitCode !== 0) {
    context.writeOutput(`::error::${retiredFilesName} failed, so the sync leaves it out.\n`);

    await runSyncCommand(context, ['git', 'reset', '-q', '--hard']);

    return { kind: 'failed' };
  }

  const removed = result.stdout.split('\n').filter((path) => path !== '');

  // The token cannot push a change under .github/workflows/ without workflows write, so a retired
  // workflow stays until the repo takes an entry with a workflow target.
  const kept = context.workflows ? removed : removed.filter((path) => !isWorkflowPath(path));

  if (kept.length < removed.length) {
    await runSyncCommand(context, ['git', 'checkout', '-q', '--', '.github/workflows']);
  }

  if (kept.length === 0) {
    return { kind: 'removed', synced: [] };
  }

  await runSyncCommand(context, ['git', 'add', '-A']);

  await runSyncCommand(context, [
    'git',
    'commit',
    '-q',
    '-m',
    'chore: remove the files zgeoff/tools no longer syncs',
  ]);

  const paths = kept.map((path) => `\`${path}\``).join(', ');

  return {
    kind: 'removed',
    synced: [
      {
        name: retiredFilesName,
        description: `The copies of files zgeoff/tools no longer syncs: ${paths}`,
      },
    ],
  };
}

// GitHub closes the pull request of a deleted branch.
async function pushSyncBranch(context: SyncContext, committed: CommittedEntries): Promise<boolean> {
  if (committed.synced.length > 0) {
    await runSyncCommand(context, ['git', 'push', '-q', '--force', 'origin', context.branch]);

    return true;
  }

  const hasRemoteBranch = await probeRemoteBranch(context, context.branch);

  if (committed.failed.length === 0 && hasRemoteBranch) {
    context.writeOutput(`Every entry matches the source; deleting ${context.branch}.\n`);

    await runSyncCommand(context, ['git', 'push', '-q', 'origin', '--delete', context.branch]);
  }

  return false;
}

async function probeRemoteBranch(context: SyncContext, branch: string): Promise<boolean> {
  const result = await runProbeCommand(context, [
    'git',
    'ls-remote',
    '--exit-code',
    '--heads',
    'origin',
    branch,
  ]);

  return result.exitCode === 0;
}

async function writePullRequest(
  context: SyncContext,
  synced: readonly SyncedEntry[],
): Promise<void> {
  const title = `chore: sync zgeoff/tools ${context.pin}`;
  const body = renderPullRequestBody(context.pin, synced);

  const listed = await runSyncCommand(context, [
    'gh',
    'pr',
    'list',
    '--head',
    context.branch,
    '--state',
    'open',
    '--json',
    'number',
    '--jq',
    '.[0].number // empty',
  ]);

  const number = listed.stdout.trim();

  if (number !== '') {
    await runSyncCommand(context, ['gh', 'pr', 'edit', number, '--title', title, '--body', body]);

    context.writeOutput(`Updated pull request #${number} for ${context.branch}.\n`);

    return;
  }

  const created = await runSyncCommand(context, [
    'gh',
    'pr',
    'create',
    '--base',
    context.base,
    '--head',
    context.branch,
    '--title',
    title,
    '--body',
    body,
  ]);

  context.writeOutput(created.stdout);
}

function renderPullRequestBody(pin: string, synced: readonly SyncedEntry[]): string {
  const lines = synced.map((entry) => `- \`${entry.name}\`: ${entry.description}`);

  return `Copied from zgeoff/tools at ${pin} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry:\n\n${lines.join('\n')}`;
}

async function removeEntryBranches(
  context: SyncContext,
  pushed: boolean,
  failed: readonly string[],
): Promise<void> {
  if (!pushed && failed.length > 0) {
    context.writeOutput('No pull request published; the per-entry branches stay.\n');

    return;
  }

  for (const entry of context.entries.filter((candidate) => !failed.includes(candidate.name))) {
    const branch = `sync/${entry.name}`;

    const hasBranch = await probeRemoteBranch(context, branch);

    if (hasBranch) {
      await runSyncCommand(context, ['git', 'push', '-q', 'origin', '--delete', branch]);
    }
  }
}

if (import.meta.main) {
  process.exitCode = await syncEntries({
    cwd: process.cwd(),
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
