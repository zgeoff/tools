// A reusable workflow's first step downloads this file alone with curl, so it imports no other file
// of this repo.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';

// The scripts each reusable workflow's steps run. The download adds every file they import.
export const stepScriptSets = {
  'bun-checks': [
    'scripts/bun-checks/write-check-plan.ts',
    'scripts/bun-checks/check-shell.ts',
    'scripts/bun-checks/check-docs.ts',
    'scripts/bun-checks/check-workflows.ts',
    'scripts/ci/install-pinned-tool.ts',
    'scripts/ci/run-package-scripts.ts',
    'scripts/ci/require-every-job.ts',
    'sync/pre-push/run-workflows-check.ts',
    'sync/pre-push/run-commits-check.ts',
    'sync/pre-push/run-local-paths-check.ts',
    'sync/pre-push/run-test-timeouts-check.ts',
  ],
  'paths-changed': ['scripts/paths-changed/match-changed-files.ts'],
  'repo-sync': ['scripts/repo-sync/write-sync-entries.ts', 'scripts/repo-sync/sync-entries.ts'],
  'audit-fix': [
    'scripts/audit-fix/fix-advisories.ts',
    'scripts/audit-fix/commit-audit-fix.ts',
    'scripts/audit-fix/open-audit-fix-pull-request.ts',
  ],
  release: [
    'scripts/check-release-head.sh',
    'scripts/merge-release-prs.sh',
    'scripts/release/sync-release-pr.ts',
    'scripts/release/pick-release-outputs.ts',
  ],
} as const satisfies Record<string, readonly string[]>;

export type StepScriptSet = keyof typeof stepScriptSets;

export type ReadToolsFile = (path: string) => Promise<string>;

export interface StepScriptsDownload {
  readonly entries: readonly string[];

  readonly destination: string;

  readonly readToolsFile: ReadToolsFile;
}

// Returns the repo paths it wrote, each under the destination at the same relative path, so a
// relative import between two downloaded files resolves as it does in the repo.
export async function downloadStepScripts(
  download: Readonly<StepScriptsDownload>,
): Promise<string[]> {
  const written = new Set<string>();

  let pending = [...download.entries];

  while (pending.length > 0) {
    const batch = pending.filter((path) => !written.has(path));

    for (const path of batch) {
      written.add(path);
    }

    const imported = await Promise.all(
      batch.map(async (path) => {
        const text = await download.readToolsFile(path);

        const target = join(download.destination, path);

        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, text);

        return collectImportedPaths(path, text);
      }),
    );

    pending = [...new Set(imported.flat())];
  }

  return [...written];
}

const transpiler = new Bun.Transpiler({ loader: 'ts' });

// A caller's runner installs no package for the downloaded files, so a package import would fail
// only when the step runs.
function collectImportedPaths(path: string, text: string): string[] {
  if (!path.endsWith('.ts')) {
    return [];
  }

  return transpiler.scanImports(text).flatMap((imported) => {
    if (isBuiltinModule(imported.path)) {
      return [];
    }

    if (!imported.path.startsWith('.')) {
      throw new Error(
        `${path} imports the package ${imported.path}, which a downloaded step script cannot install`,
      );
    }

    return [normalize(join(dirname(path), imported.path))];
  });
}

function isBuiltinModule(specifier: string): boolean {
  return specifier === 'bun' || specifier.startsWith('bun:') || specifier.startsWith('node:');
}

export interface ToolsFileReaderOptions {
  readonly toolsURL: string;

  readonly attempts: number;

  readonly retryDelayMs: number;
}

// raw.githubusercontent.com answers a missing file with 404 and a passing fault with a 5xx or 429,
// so only those, and a failed connection, try again.
export function makeToolsFileReader(options: Readonly<ToolsFileReaderOptions>): ReadToolsFile {
  return async (path) => {
    const url = `${options.toolsURL}/${path}`;

    for (let attempt = 1; ; attempt += 1) {
      const outcome = await readURL(url);

      if (outcome.kind === 'read') {
        return outcome.text;
      }

      if (outcome.kind === 'refused' || attempt >= options.attempts) {
        throw new Error(`could not download ${url}: ${outcome.reason}`);
      }

      await Bun.sleep(options.retryDelayMs);
    }
  };
}

type URLOutcome =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

async function readURL(url: string): Promise<URLOutcome> {
  try {
    const response = await fetch(url);

    if (response.ok) {
      return { kind: 'read', text: await response.text() };
    }

    const reason = `HTTP ${response.status}`;

    return response.status === 429 || response.status >= 500
      ? { kind: 'failed', reason }
      : { kind: 'refused', reason };
  } catch (error) {
    return { kind: 'failed', reason: error instanceof Error ? error.message : String(error) };
  }
}

// The commit is a full sha, so a job context without one fails here and not on a later 404.
const toolsURLPattern = /^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[0-9a-f]{40}$/u;

export function isToolsURL(value: string): boolean {
  return toolsURLPattern.test(value);
}

function isStepScriptSet(value: string): value is StepScriptSet {
  return Object.hasOwn(stepScriptSets, value);
}

async function runCLI(): Promise<void> {
  const name = process.argv[2] ?? '';
  const toolsURL = process.env['TOOLS_URL'] ?? '';
  const runnerTemp = process.env['RUNNER_TEMP'] ?? '';

  if (!isStepScriptSet(name)) {
    process.stderr.write(
      `usage: download-step-scripts.ts <${Object.keys(stepScriptSets).join('|')}>\n`,
    );

    process.exitCode = 2;

    return;
  }

  if (!isToolsURL(toolsURL) || runnerTemp === '') {
    process.stdout.write(
      `::error::the download needs TOOLS_URL, raw.githubusercontent.com/<owner>/<repo>/<commit sha>, and RUNNER_TEMP; TOOLS_URL is '${toolsURL}'\n`,
    );

    process.exitCode = 1;

    return;
  }

  const written = await downloadStepScripts({
    entries: stepScriptSets[name],
    destination: join(runnerTemp, 'tools'),
    readToolsFile: makeToolsFileReader({ toolsURL, attempts: 4, retryDelayMs: 2000 }),
  });

  process.stdout.write(`downloaded ${written.length} files from ${toolsURL}\n`);
}

if (import.meta.main) {
  await runCLI();
}
