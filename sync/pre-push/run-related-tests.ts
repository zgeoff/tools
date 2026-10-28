import { existsSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { readOptionalText } from './read-memory-budget.ts';
import { readWorkerCount } from './read-worker-count.ts';
import type { WorkerCountSources } from './read-worker-count.ts';

// A host with one worker runs each file slower than CI, and a test that passes there must not fail
// the push.
const slowHostTestTimeoutMs = 15_000;
const defaultMaxTestFiles = 50;

export async function runRelatedTests(
  args: readonly string[],
  cwd: string,
  workerSources: Readonly<WorkerCountSources>,
): Promise<number> {
  const options = parseRelatedTestArgs(args);

  if (options.kind === 'invalid') {
    process.stderr.write(`run-related-tests: ${options.message}\n`);

    return 2;
  }

  const plan = buildRelatedTestPlan(
    options.paths,
    resolveRelatedTests(options.paths, cwd),
    options.maxFiles,
  );

  if (plan.kind === 'skip') {
    process.stdout.write(`run-related-tests: ${plan.message}\n`);

    return 0;
  }

  const workers = await readWorkerCount(workerSources);

  if (workers.kind === 'invalid') {
    process.stderr.write(`run-related-tests: ${workers.message}\n`);

    return 2;
  }

  const flags = [
    `--parallel=${workers.count}`,
    ...(workers.count === 1 ? [`--timeout=${slowHostTestTimeoutMs}`] : []),
  ];

  // bun test reads a bare argument as a name filter; the ./ makes it a path.
  const run = Bun.spawn(
    ['bun', 'run', 'test', ...flags, ...plan.tests.map((path) => `./${path}`)],
    { cwd, stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' },
  );

  return run.exited;
}

export function resolveRelatedTests(paths: readonly string[], cwd: string): string[] {
  const selected = new Set<string>();

  for (const path of paths) {
    const test = findRelatedTest(path);

    if (test !== undefined && existsSync(join(cwd, test))) {
      selected.add(test);
    }
  }

  return [...selected];
}

type RelatedTestArgs =
  | { readonly kind: 'valid'; readonly maxFiles: number; readonly paths: readonly string[] }
  | { readonly kind: 'invalid'; readonly message: string };

function parseRelatedTestArgs(args: readonly string[]): RelatedTestArgs {
  const parsed = parseCLIArgs(args);

  if (parsed instanceof Error) {
    return { kind: 'invalid', message: parsed.message };
  }

  const maxFiles = parsed.values['max-files'];

  if (maxFiles === undefined) {
    return { kind: 'valid', maxFiles: defaultMaxTestFiles, paths: parsed.positionals };
  }

  const count = Number(maxFiles);

  if (!/^[1-9]\d*$/u.test(maxFiles) || !Number.isSafeInteger(count)) {
    return {
      kind: 'invalid',
      message: `--max-files is ${maxFiles}; set it to a whole number above 0`,
    };
  }

  return { kind: 'valid', maxFiles: count, paths: parsed.positionals };
}

// parseArgs throws on an option it does not declare, which the caller reports as a refused input.
function parseCLIArgs(args: readonly string[]) {
  try {
    return parseArgs({
      args: [...args],
      options: { 'max-files': { type: 'string' } },
      allowPositionals: true,
    });
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

type RelatedTestPlan =
  | { readonly kind: 'run'; readonly tests: readonly string[] }
  | { readonly kind: 'skip'; readonly message: string };

function buildRelatedTestPlan(
  paths: readonly string[],
  tests: readonly string[],
  maxFiles: number,
): RelatedTestPlan {
  const shared = paths.find((path) => isSharedTestInput(path));

  if (shared !== undefined) {
    return {
      kind: 'skip',
      message: `skipped, because the branch changes ${shared}, a shared test helper or config; CI runs the full suite`,
    };
  }

  if (tests.length > maxFiles) {
    return {
      kind: 'skip',
      message: `skipped, because the branch has ${tests.length} related unit test files, over the cap of ${maxFiles}; CI runs the full suite`,
    };
  }

  if (tests.length === 0) {
    return { kind: 'skip', message: 'no related tests' };
  }

  return { kind: 'run', tests };
}

// A shared helper or a bunfig.toml reaches tests beyond the siblings of the files it changes.
function isSharedTestInput(path: string): boolean {
  return /(?:^|\/)test-utils\//u.test(path) || basename(path) === 'bunfig.toml';
}

const sourcePattern = /^(?<stem>.+?)(?:\.test)?(?<ext>\.tsx?)$/u;

function findRelatedTest(path: string): string | undefined {
  const groups = sourcePattern.exec(path)?.groups;

  if (groups === undefined || path.endsWith('.d.ts') || isLaneFile(path)) {
    return undefined;
  }

  return `${groups['stem']}.test${groups['ext']}`;
}

// A lane's tests need a browser, a container or the host, and run in their own CI job.
function isLaneFile(path: string): boolean {
  return (
    /(?:^|\/)e2e\//u.test(path) ||
    /\.(?:browser|docker|host)(?:\.test)?\.tsx?$/u.test(basename(path))
  );
}

if (import.meta.main) {
  const exitCode = await runRelatedTests(process.argv.slice(2), process.cwd(), {
    env: process.env,
    cores: availableParallelism(),
    totalMemory: totalmem(),
    procRoot: '/proc',
    cgroupRoot: '/sys/fs/cgroup',
    readText: readOptionalText,
  });

  process.exit(exitCode);
}
