import { dirname, join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import type { CopyPlan, ExistingWorkflow, SyncFileRow } from './build-copy-plan.ts';
import { buildCopyPlan } from './build-copy-plan.ts';
import { buildSyncRowSplit } from './build-sync-row-split.ts';
import { buildToolsPin } from './build-tools-pin.ts';
import { isWorkflowPath } from './is-workflow-path.ts';
import type { SyncEntry } from './parse-sync-entries.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';
import type { RetiredFileRemoval, SyncedEntry } from './plan-retired-file-removal.ts';
import { planRetiredFileRemoval, retiredFilesName } from './plan-retired-file-removal.ts';
import { readSyncCommitVerdict } from './read-sync-commit-verdict.ts';
import { renderSyncPullRequestTitle } from './render-sync-pull-request-title.ts';
import { selectSyncFiles } from './select-sync-files.ts';
import { writeSyncAutoMerge } from './write-sync-auto-merge.ts';
import { writeToolsPins } from './write-tools-pins.ts';

export interface SyncEntriesOptions {
  readonly cwd: string;

  // The whole environment of each command the sync runs, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<
    FileSystem,
    'appendText' | 'createDirectory' | 'probePath' | 'readText' | 'writeText'
  >;

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
  readonly commit: string;
  readonly repo: string;
  readonly skip: string;
  readonly base: string;
}

interface SyncContext extends SyncSettings {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fileSystem: Pick<
    FileSystem,
    'appendText' | 'createDirectory' | 'probePath' | 'readText' | 'writeText'
  >;
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

  const verdict = await readSyncCommitVerdict(context, {
    commit: context.commit,
    branch: context.branch,
    base: context.base,
  });

  if (verdict.kind === 'refused') {
    options.writeOutput(`::error::${verdict.message}\n`);

    return 1;
  }

  if (verdict.kind === 'superseded') {
    options.writeOutput(
      `${verdict.holder} already pins ${verdict.pin}, which is newer than ${context.commit}; nothing to do.\n`,
    );

    return 0;
  }

  const committed = await commitEntries(context);

  if (committed.synced.length > 0) {
    await removeAutoMerge(context);
  }

  const pushed = await pushSyncBranch(context, committed);

  if (pushed) {
    const number = await writePullRequest(context, committed.synced);

    await writeSyncAutoMerge(context, { ...committed, number, base: context.base });
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
  const commit = env['TOOLS_REF'] ?? '';

  if (!isCommitID(commit)) {
    return {
      kind: 'refused',
      message: `the tools ref '${commit.replaceAll(':', ' ')}' is not a full commit ID`,
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
    commit,
    repo: env['REPO'] ?? '',
    skip: env['SKIP'] ?? '',
    base: env['BASE'] ?? '',
  };
}

function isCommitID(ref: string): boolean {
  return /^[0-9a-f]{40}$/u.test(ref);
}

interface CommittedEntries {
  readonly synced: readonly SyncedEntry[];
  readonly failed: readonly string[];

  // The commit the sync branch starts from.
  readonly start: string;

  // The targets the run copied and the retired copies it removed.
  readonly delivered: readonly string[];

  // Each package.json script that a build of the run writes, with the value it writes.
  readonly scripts: Readonly<Record<string, string>>;
}

async function commitEntries(context: SyncContext): Promise<CommittedEntries> {
  const synced: SyncedEntry[] = [];
  const failed: string[] = [];
  const taken: string[] = [];
  const copied: string[] = [];
  const scripts: Record<string, string> = {};

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

  const startHead = await runSyncCommand(context, ['git', 'rev-parse', 'HEAD']);

  const start = startHead.stdout.trim();

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
    Object.assign(scripts, entry.scripts);

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

  const committed: CommittedEntries =
    retired.kind === 'failed'
      ? { synced, failed: [...failed, retiredFilesName], start, delivered: copied, scripts }
      : {
          synced: [...synced, ...retired.synced],
          failed,
          start,
          delivered: [...copied, ...retired.paths],
          scripts,
        };

  if (committed.synced.length === 0) {
    return committed;
  }

  const pinned = await writeToolsPins(context, context.commit);

  return { ...committed, delivered: [...committed.delivered, ...pinned] };
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

  // A file the caller does not receive is never read: its target may be anything, a folder too.
  const taken = buildSyncRowSplit(rows).taken;

  for (const row of taken.filter((candidate) => isWorkflowPath(candidate.target))) {
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

      await context.fileSystem.writeText(path, buildToolsPin(text, context.commit));
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

function runProbeCommand(context: SyncContext, argv: readonly string[]): Promise<CommandResult> {
  return context.runCommand(argv, { cwd: context.cwd, env: context.env });
}

type RetiredFiles =
  | {
      readonly kind: 'removed';
      readonly synced: readonly SyncedEntry[];
      readonly paths: readonly string[];
    }
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

    return { kind: 'removed', synced: [], paths: [] };
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

  const removal = planRetiredFileRemoval({ exitCode: result.exitCode, removedText: result.stdout });

  return applyRetiredFileRemoval(removal, context);
}

type RetiredFileRemovalOf<Kind extends RetiredFileRemoval['kind']> = Extract<
  RetiredFileRemoval,
  { readonly kind: Kind }
>;

type RetiredFileRemovalApplier<Kind extends RetiredFileRemoval['kind']> = (
  removal: RetiredFileRemovalOf<Kind>,
  context: SyncContext,
) => Promise<RetiredFiles>;

// A table typed over every kind of removal, so a new kind fails the type check until it applies.
const retiredFileRemovalAppliers: {
  readonly [Kind in RetiredFileRemoval['kind']]: RetiredFileRemovalApplier<Kind>;
} = {
  failed: async (_removal, context) => {
    context.writeOutput(`::error::${retiredFilesName} failed, so the sync leaves it out.\n`);

    await runSyncCommand(context, ['git', 'reset', '-q', '--hard']);

    return { kind: 'failed' };
  },
  removed: async (removal, context) => {
    if (removal.synced.length > 0) {
      await runSyncCommand(context, ['git', 'add', '-A']);

      await runSyncCommand(context, [
        'git',
        'commit',
        '-q',
        '-m',
        'chore: remove the files zgeoff/tools no longer syncs',
      ]);
    }

    return { kind: 'removed', synced: removal.synced, paths: removal.paths };
  },
};

function applyRetiredFileRemoval<Kind extends RetiredFileRemoval['kind']>(
  removal: RetiredFileRemovalOf<Kind>,
  context: SyncContext,
): Promise<RetiredFiles> {
  const apply: RetiredFileRemovalApplier<Kind> = retiredFileRemovalAppliers[removal.kind];

  return apply(removal, context);
}

// GitHub keeps auto-merge on through a push by a user with write access, the sync's own force push
// included, and checks --match-head-commit only when auto-merge turns on. Auto-merge goes off before
// the push, so a run that stops before it checks the new head leaves the pull request to review.
async function removeAutoMerge(context: SyncContext): Promise<void> {
  const listed = await runSyncCommand(context, [
    'gh',
    'pr',
    'list',
    '--head',
    context.branch,
    '--state',
    'open',
    '--json',
    'number,autoMergeRequest',
    '--jq',
    '.[] | select(.autoMergeRequest != null) | .number',
  ]);

  for (const number of listed.stdout.split('\n').filter((line) => line !== '')) {
    await runSyncCommand(context, ['gh', 'pr', 'merge', number, '--disable-auto']);
  }
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

// ls-remote --exit-code exits with 2 when no ref matches; any other failure, such as a refused
// login or a lost connection, fails the run with git's own error.
async function probeRemoteBranch(context: SyncContext, branch: string): Promise<boolean> {
  const argv = ['git', 'ls-remote', '--exit-code', '--heads', 'origin', branch];

  const result = await runProbeCommand(context, argv);

  if (result.exitCode === 0 || result.exitCode === 2) {
    return result.exitCode === 0;
  }

  throw new Error(`${argv.join(' ')} exited with ${result.exitCode}: ${result.stderr}`);
}

async function writePullRequest(
  context: SyncContext,
  synced: readonly SyncedEntry[],
): Promise<string> {
  const title = renderSyncPullRequestTitle(synced);
  const body = renderPullRequestBody(context.commit, synced);

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

    return number;
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

  // gh prints the new pull request's URL, which ends in its number.
  const url = created.stdout.trim();

  return url.slice(url.lastIndexOf('/') + 1);
}

function renderPullRequestBody(commit: string, synced: readonly SyncedEntry[]): string {
  const lines = synced.map((entry) => `- \`${entry.name}\`: ${entry.description}`);

  return `Copied from zgeoff/tools at ${commit} by the repo-sync workflow; edit the source there, not this copy. Each commit syncs one entry or pins the calls to zgeoff/tools workflows to that commit:\n\n${lines.join('\n')}`;
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
