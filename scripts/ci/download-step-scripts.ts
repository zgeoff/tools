// A reusable workflow's first step downloads this file alone with curl, so it imports no other file
// of this repo.
import { mkdir, writeFile } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join, normalize } from 'node:path';
import { parseArgs } from 'node:util';

// The scripts each reusable workflow's steps run. The download fetches the bundle of each
// TypeScript script, which a step runs.
export const stepScriptSets = {
  'bun-checks': [
    'scripts/bun-checks/write-check-plan.ts',
    'scripts/bun-checks/run-shell-check.ts',
    'scripts/bun-checks/run-docs-check.ts',
    'scripts/bun-checks/run-actionlint-check.ts',
    'scripts/ci/run-pinned-tool-step.ts',
    'scripts/ci/run-package-scripts.ts',
    'scripts/ci/collect-failed-jobs.ts',
    'packages/chex/src/run-workflows-check.ts',
    'packages/chex/src/run-commits-check.ts',
    'packages/chex/src/run-local-paths-check.ts',
    'packages/chex/src/run-test-timeouts-check.ts',
    'packages/chex/src/dependency-gates/run-dependency-gates-check.ts',
  ],
  'paths-changed': ['scripts/paths-changed/run-changed-files-step.ts'],
  'repo-sync': [
    'scripts/repo-sync/write-sync-ref.ts',
    'scripts/repo-sync/write-sync-entries.ts',
    'scripts/repo-sync/sync-entries.ts',
    'scripts/repo-sync/write-sync-alarm.ts',
  ],
  'repo-sync-guard': ['scripts/repo-sync/hold-hand-pushed-sync.ts'],
  'audit-fix': [
    'scripts/audit-fix/fix-advisories.ts',
    'scripts/audit-fix/commit-audit-fix.ts',
    'scripts/audit-fix/open-audit-fix-pull-request.ts',
  ],
  release: [
    'scripts/check-release-head.sh',
    'scripts/merge-release-prs.sh',
    'scripts/release/run-sync-release-pr.ts',
    'scripts/release/run-release-outputs-step.ts',
  ],
} as const satisfies Record<string, readonly string[]>;

export type StepScriptSet = keyof typeof stepScriptSets;

// The folder that holds one bundle of each TypeScript step script. Bun bundles each script with
// every file and package it imports, so a caller's runner runs it with no install.
export const stepBundlesFolder = 'step-bundles';

// A step runs a TypeScript script from its bundle, at the script's repo path with a .js extension,
// so a path the script builds from its own folder still finds the files downloaded beside it.
export function toStepRunPath(entry: string): string {
  return entry.endsWith('.ts') ? `${entry.slice(0, -'.ts'.length)}.js` : entry;
}

export function toStepToolsPath(runPath: string): string {
  return runPath.endsWith('.js') ? `${stepBundlesFolder}/${runPath}` : runPath;
}

export type ReadToolsFile = (path: string) => Promise<string>;

// Writes the text as the file at the path, and creates its folders first.
export type WriteFile = (path: string, text: string) => Promise<void>;

export interface StepScriptsDownload {
  readonly entries: readonly string[];

  readonly destination: string;

  readonly readToolsFile: ReadToolsFile;

  readonly writeFile: WriteFile;
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

        await download.writeFile(join(download.destination, path), text);

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
  if (!path.endsWith('.ts') && !path.endsWith('.js')) {
    return [];
  }

  return transpiler.scanImports(text).flatMap((imported) => {
    // Bun writes a bundle's built-in imports without the node: prefix.
    if (isBuiltin(imported.path)) {
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

export type URLOutcome =
  | { readonly kind: 'read'; readonly text: string }
  | { readonly kind: 'failed'; readonly reason: string }
  | { readonly kind: 'refused'; readonly reason: string };

export interface ToolsFileReaderOptions {
  readonly toolsURL: string;

  readonly attempts: number;

  readonly retryDelayMs: number;

  readonly readURL: (url: string) => Promise<URLOutcome>;

  readonly wait: (delayMs: number) => Promise<void>;
}

// raw.githubusercontent.com answers a missing file with 404 and a passing fault with a 5xx or 429,
// so only those, and a failed connection, try again.
export function makeToolsFileReader(options: Readonly<ToolsFileReaderOptions>): ReadToolsFile {
  return async (path) => {
    const url = `${options.toolsURL}/${path}`;

    for (let attempt = 1; ; attempt += 1) {
      const outcome = await options.readURL(url);

      if (outcome.kind === 'read') {
        return outcome.text;
      }

      if (outcome.kind === 'refused' || attempt >= options.attempts) {
        throw new Error(`could not download ${url}: ${outcome.reason}`);
      }

      await options.wait(options.retryDelayMs);
    }
  };
}

export async function readURL(url: string): Promise<URLOutcome> {
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

type DownloadArgs =
  | { readonly kind: 'parsed'; readonly set: StepScriptSet }
  | { readonly kind: 'refused'; readonly message: string };

export function parseDownloadArgs(args: readonly string[]): DownloadArgs {
  const usage = `usage: download-step-scripts.ts <${Object.keys(stepScriptSets).join('|')}>`;

  try {
    const positionals = parseArgs({
      args: [...args],
      options: {},
      allowPositionals: true,
      strict: true,
    }).positionals;

    const [set] = positionals;

    return positionals.length === 1 && set !== undefined && isStepScriptSet(set)
      ? { kind: 'parsed', set }
      : { kind: 'refused', message: usage };
  } catch (error) {
    return {
      kind: 'refused',
      message: `${error instanceof Error ? error.message : String(error)}\n${usage}`,
    };
  }
}

export interface DownloadStep {
  readonly args: readonly string[];

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly readURL: (url: string) => Promise<URLOutcome>;

  readonly wait: (delayMs: number) => Promise<void>;

  readonly writeFile: WriteFile;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// Returns the step's exit code: 2 for a wrong argument, 1 for a job context that lacks the commit.
export async function runDownloadStep(step: Readonly<DownloadStep>): Promise<number> {
  const parsed = parseDownloadArgs(step.args);
  const toolsURL = step.env['TOOLS_URL'] ?? '';
  const runnerTemp = step.env['RUNNER_TEMP'] ?? '';

  if (parsed.kind === 'refused') {
    step.writeError(`${parsed.message}\n`);

    return 2;
  }

  if (!isToolsURL(toolsURL) || runnerTemp === '') {
    step.writeOutput(
      `::error::the download needs TOOLS_URL, raw.githubusercontent.com/<owner>/<repo>/<commit sha>, and RUNNER_TEMP; TOOLS_URL is '${toolsURL}'\n`,
    );

    return 1;
  }

  const readToolsFile = makeToolsFileReader({
    toolsURL,
    attempts: 4,
    retryDelayMs: 2000,
    readURL: step.readURL,
    wait: step.wait,
  });

  const written = await downloadStepScripts({
    entries: stepScriptSets[parsed.set].map((entry) => toStepRunPath(entry)),
    destination: join(runnerTemp, 'tools'),
    readToolsFile: (path) => readToolsFile(toStepToolsPath(path)),
    writeFile: step.writeFile,
  });

  step.writeOutput(`downloaded ${written.length} files from ${toolsURL}\n`);

  return 0;
}

if (import.meta.main) {
  process.exitCode = await runDownloadStep({
    args: process.argv.slice(2),
    env: process.env,
    readURL,
    wait: (delayMs) => Bun.sleep(delayMs),
    writeFile: async (path, text) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, text);
    },
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
