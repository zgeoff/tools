import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { parseSyncEntries } from './parse-sync-entries.ts';
import type { SyncDispatchRange } from './pick-sync-dispatch-range.ts';
import { pickSyncDispatchRange } from './pick-sync-dispatch-range.ts';

export interface WriteSyncDispatchPlanOptions {
  // A checkout of zgeoff/tools with the history of main.
  readonly cwd: string;

  // The whole environment of each command, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly event: string;
  readonly runCommit: string;

  // The owner and name of this repository.
  readonly repo: string;

  readonly outputPath: string;
  readonly fileSystem: Pick<FileSystem, 'appendText'>;
  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

const manifestPath = 'sync/manifest.json';

export async function writeSyncDispatchPlan(
  options: Readonly<WriteSyncDispatchPlanOptions>,
): Promise<number> {
  const runs = await runPlanCommand(options, [
    'gh',
    'api',
    '-X',
    'GET',
    `repos/${options.repo}/actions/workflows/main.yml/runs`,
    '-f',
    'branch=main',
    '-f',
    'event=push',
    '-f',
    'status=success',
    '-f',
    'per_page=50',
    '--jq',
    '.workflow_runs[].head_sha',
  ]);

  const range = pickSyncDispatchRange({
    event: options.event,
    runCommit: options.runCommit,
    greenCommits: runs.stdout.split('\n').filter((commit) => commit !== ''),
  });

  if (range.kind === 'skip') {
    options.writeOutput(`No sync: ${range.reason}.\n`);

    await writeStepOutputs(options.fileSystem, options.outputPath, { send: 'false', commit: '' });

    return 0;
  }

  const changed = range.kind === 'always' ? true : await probeSyncedChange(options, range);

  const message = changed
    ? `Dispatching ${range.commit} to every repo that syncs from zgeoff/tools.\n`
    : `No synced source changed up to ${range.commit}; nothing to dispatch.\n`;

  options.writeOutput(message);

  await writeStepOutputs(options.fileSystem, options.outputPath, {
    send: String(changed),
    commit: range.commit,
  });

  return 0;
}

function runPlanCommand(
  options: Readonly<WriteSyncDispatchPlanOptions>,
  argv: readonly string[],
): Promise<CommandResult> {
  return runCheckedCommand(options.runCommand, argv, { cwd: options.cwd, env: options.env });
}

// A source of either manifest counts, so a change that drops an entry or moves its source sends the
// sync that removes the retired copies.
async function probeSyncedChange(
  options: Readonly<WriteSyncDispatchPlanOptions>,
  range: Extract<SyncDispatchRange, { readonly kind: 'range' }>,
): Promise<boolean> {
  if (range.previous === null) {
    return true;
  }

  // A commit that turned green after the job's checkout is not in the checkout yet.
  await runPlanCommand(options, ['git', 'fetch', '-q', 'origin', range.previous, range.commit]);

  const diff = await runPlanCommand(options, [
    'git',
    'diff',
    '--name-only',
    '-z',
    '--no-renames',
    range.previous,
    range.commit,
  ]);

  const sources = new Set([
    manifestPath,
    ...(await readManifestSources(options, range.previous)),
    ...(await readManifestSources(options, range.commit)),
  ]);

  return diff.stdout.split('\0').some((path) => sources.has(path));
}

async function readManifestSources(
  options: Readonly<WriteSyncDispatchPlanOptions>,
  commit: string,
): Promise<string[]> {
  const shown = await runPlanCommand(options, ['git', 'show', `${commit}:${manifestPath}`]);

  const manifestValue: unknown = JSON.parse(shown.stdout);
  const entries = parseSyncEntries(manifestValue) ?? [];

  return entries.flatMap((entry) => entry.files.map((file) => file.source));
}

if (import.meta.main) {
  process.exitCode = await writeSyncDispatchPlan({
    cwd: process.cwd(),
    env: process.env,
    event: process.env['EVENT'] ?? '',
    runCommit: process.env['RUN_COMMIT'] ?? '',
    repo: process.env['REPO'] ?? '',
    outputPath: process.env['GITHUB_OUTPUT'] ?? '',
    fileSystem: nodeFileSystem,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
