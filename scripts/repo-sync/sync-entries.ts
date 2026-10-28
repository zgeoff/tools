import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { $ } from 'bun';
import { isRecord } from '../../packages/std/src/is-record.ts';

export interface SyncEntriesOptions {
  readonly cwd: string;

  // The whole environment of each command the sync runs, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;
}

interface SyncEntry {
  readonly name: string;
  readonly description: string;

  // The entry's files as the manifest lists them, which the file selector reads as JSON.
  readonly filesJSON: string;

  readonly build: string;
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
  readonly shell: typeof $;
}

export async function syncEntries(options: Readonly<SyncEntriesOptions>): Promise<number> {
  const settings = parseSyncSettings(options.env);

  if (settings.kind === 'refused') {
    process.stdout.write(`::error::${settings.message}\n`);

    return 1;
  }

  const shell = new $.Shell().cwd(options.cwd).env({ ...options.env });

  const context: SyncContext = { ...settings, cwd: options.cwd, shell };

  const committed = await commitEntries(context);
  const pushed = await pushSyncBranch(context, committed);

  if (pushed) {
    await writePullRequest(context, committed.synced);
  }

  await removeEntryBranches(context, pushed, committed.failed);

  if (committed.failed.length > 0) {
    process.stdout.write(
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

  const entries = parseSyncEntries(env['ENTRIES'] ?? '');

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

function parseSyncEntries(text: string): SyncEntry[] | null {
  const json = text === '' ? '[]' : text;
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    return null;
  }

  const entries = parsed.map((entry: unknown) =>
    isRecord(entry) && typeof entry['name'] === 'string' && Array.isArray(entry['files'])
      ? {
          name: entry['name'],
          description: formatDescription(entry['description']),
          filesJSON: JSON.stringify(entry['files']),
          build: typeof entry['build'] === 'string' ? entry['build'] : '',
        }
      : null,
  );

  return entries.every((entry) => entry !== null) ? entries : null;
}

function formatDescription(description: unknown): string {
  return typeof description === 'string' ? description : JSON.stringify(description ?? null);
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
  const shell = context.shell;
  const synced: SyncedEntry[] = [];
  const failed: string[] = [];
  const taken: string[] = [];
  const copied: string[] = [];

  // The checkout of this repository stays out of every commit.
  await appendFile(join(context.cwd, '.git/info/exclude'), '/.repo-sync/\n');
  await shell`git config user.email ${'41898282+github-actions[bot]@users.noreply.github.com'}`;
  await shell`git config user.name ${'github-actions[bot]'}`;
  await shell`git checkout -q -B ${context.branch}`;

  for (const entry of context.entries) {
    const written = await writeEntry(context, entry);

    if (written === null) {
      process.stdout.write(`::error::${entry.name} failed, so the sync leaves it out.\n`);

      await shell`git reset -q --hard`;
      await shell`git clean -q -f -d`;

      failed.push(entry.name);
      continue;
    }

    taken.push(entry.name);
    copied.push(...written);

    await shell`git add -A`;

    const isUnchanged = await probeNothingStaged(shell);

    if (isUnchanged) {
      process.stdout.write(`${entry.name} matches the source; nothing to sync.\n`);
      continue;
    }

    await shell`git commit -q -m ${`chore: sync ${entry.name} from zgeoff/tools`}`;

    synced.push({ name: entry.name, description: entry.description });
  }

  const retired = await removeRetiredFiles(context, taken, copied);

  return retired.kind === 'failed'
    ? { synced, failed: [...failed, retiredFilesName] }
    : { synced: [...synced, ...retired.synced], failed };
}

// The build runs in the caller's checkout with the runner's stock tools; the manifest README states
// that contract.
async function writeEntry(context: SyncContext, entry: SyncEntry): Promise<string[] | null> {
  try {
    const copied = await copyEntryFiles(context, entry);

    if (copied === null) {
      return null;
    }

    if (entry.build !== '') {
      await context.shell`bash -euo pipefail -c ${entry.build}`;
    }

    return copied;
  } catch {
    return null;
  }
}

async function copyEntryFiles(context: SyncContext, entry: SyncEntry): Promise<string[] | null> {
  const shell = context.shell;

  const rowsText =
    await shell`bash .repo-sync/scripts/select-sync-files.sh ${context.repo} < ${new Response(entry.filesJSON)}`.text();

  const rows = parseSyncFileRows(rowsText);
  const excluded = rows.filter((row) => row.action === 'skip').map((row) => row.target);
  const copied: string[] = [];
  let hasConflict = false;

  for (const row of rows.filter((candidate) => candidate.action !== 'skip')) {
    const isOwnWorkflow = await probeOwnWorkflow(context, row);

    if (isOwnWorkflow) {
      process.stdout.write(
        `::error file=${row.target}::${row.target} is the repo's own workflow, so ${entry.name} does not overwrite it. Move its jobs to a file with another name, or add ${entry.name} to skip.\n`,
      );

      hasConflict = true;
      continue;
    }

    await mkdir(join(context.cwd, dirname(row.target)), { recursive: true });
    await shell`install -m ${row.mode} ${`.repo-sync/${row.source}`} ${row.target}`;

    if (isWorkflowPath(row.target)) {
      const path = join(context.cwd, row.target);

      const text = await readFile(path, 'utf8');

      await Bun.write(path, buildPinnedWorkflow(text, context.pin));
    }

    copied.push(row.target);
  }

  if (excluded.length > 0) {
    for (const target of copied.filter((path) => path.endsWith('.md'))) {
      await shell`bash .repo-sync/scripts/remove-excluded-blocks.sh ${target} ${excluded}`;
    }
  }

  return hasConflict ? null : copied;
}

interface SyncFileRow {
  readonly action: string;
  readonly source: string;
  readonly target: string;
  readonly mode: string;
}

function parseSyncFileRows(text: string): SyncFileRow[] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [action = '', source = '', target = '', mode = ''] = line.split('\t');

      return { action, source, target, mode };
    });
}

// Overwriting a workflow the repo wrote itself would drop its own jobs in a pull request that reads
// as a routine sync. The marker line shows a file repo-sync wrote.
async function probeOwnWorkflow(context: SyncContext, row: SyncFileRow): Promise<boolean> {
  if (!isWorkflowPath(row.target)) {
    return false;
  }

  const target = Bun.file(join(context.cwd, row.target));

  const exists = await target.exists();

  if (!exists) {
    return false;
  }

  const targetText = await target.text();

  if (targetText.includes(context.marker)) {
    return false;
  }

  const sourceText = await readFile(join(context.cwd, '.repo-sync', row.source), 'utf8');

  const calls = new Set(sourceText.match(/zgeoff\/tools\/\.github\/workflows\/[^@\s]+/gu));

  return ![...calls].some((call) => targetText.includes(call));
}

function isWorkflowPath(path: string): boolean {
  return path.startsWith('.github/workflows/');
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

async function probeNothingStaged(shell: typeof $): Promise<boolean> {
  const result = await shell`git diff --cached --quiet`.nothrow().quiet();

  return result.exitCode === 0;
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
  const shell = context.shell;
  const script = '.repo-sync/scripts/remove-retired-sync-files.sh';

  const hasScript = await Bun.file(join(context.cwd, script)).exists();

  if (!hasScript) {
    process.stdout.write('The tools ref has no retired-file cleanup; nothing to remove.\n');

    return { kind: 'removed', synced: [] };
  }

  const takenList = taken.map((name) => `${name},`).join('');

  const result =
    await shell`bash ${script} .repo-sync ${takenList} ${context.skip} ${copied.join('\n')}`
      .nothrow()
      .quiet();

  process.stderr.write(result.stderr);

  if (result.exitCode !== 0) {
    process.stdout.write(`::error::${retiredFilesName} failed, so the sync leaves it out.\n`);

    await shell`git reset -q --hard`;

    return { kind: 'failed' };
  }

  const removed = result.stdout
    .toString()
    .split('\n')
    .filter((path) => path !== '');

  // The token cannot push a change under .github/workflows/ without workflows write, so a retired
  // workflow stays until the repo takes an entry with a workflow target.
  const kept = context.workflows ? removed : removed.filter((path) => !isWorkflowPath(path));

  if (kept.length < removed.length) {
    await shell`git checkout -q -- .github/workflows`;
  }

  if (kept.length === 0) {
    return { kind: 'removed', synced: [] };
  }

  await shell`git add -A`;
  await shell`git commit -q -m ${'chore: remove the files zgeoff/tools no longer syncs'}`;

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
  const shell = context.shell;

  if (committed.synced.length > 0) {
    await shell`git push -q --force origin ${context.branch}`;

    return true;
  }

  const hasRemoteBranch = await probeRemoteBranch(shell, context.branch);

  if (committed.failed.length === 0 && hasRemoteBranch) {
    process.stdout.write(`Every entry matches the source; deleting ${context.branch}.\n`);

    await shell`git push -q origin --delete ${context.branch}`;
  }

  return false;
}

async function probeRemoteBranch(shell: typeof $, branch: string): Promise<boolean> {
  const result = await shell`git ls-remote --exit-code --heads origin ${branch}`.nothrow().quiet();

  return result.exitCode === 0;
}

async function writePullRequest(
  context: SyncContext,
  synced: readonly SyncedEntry[],
): Promise<void> {
  const shell = context.shell;
  const title = `chore: sync zgeoff/tools ${context.pin}`;
  const body = renderPullRequestBody(context.pin, synced);

  const listed =
    await shell`gh pr list --head ${context.branch} --state open --json number --jq ${'.[0].number // empty'}`.text();

  const number = listed.trim();

  if (number !== '') {
    await shell`gh pr edit ${number} --title ${title} --body ${body}`;

    process.stdout.write(`Updated pull request #${number} for ${context.branch}.\n`);

    return;
  }

  await shell`gh pr create --base ${context.base} --head ${context.branch} --title ${title} --body ${body}`;
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
    process.stdout.write('No pull request published; the per-entry branches stay.\n');

    return;
  }

  for (const entry of context.entries.filter((candidate) => !failed.includes(candidate.name))) {
    const branch = `sync/${entry.name}`;

    const hasBranch = await probeRemoteBranch(context.shell, branch);

    if (hasBranch) {
      await context.shell`git push -q origin --delete ${branch}`;
    }
  }
}

if (import.meta.main) {
  process.exitCode = await syncEntries({ cwd: process.cwd(), env: process.env });
}
