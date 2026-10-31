import { basename } from 'node:path';
import { parseArgs } from 'node:util';
import type { WorkerCount } from './read-worker-count.ts';
import { resolveRelatedTests } from './resolve-related-tests.ts';
import type { RelatedTestSources } from './resolve-related-tests.ts';
import type { UnitRunDeps } from './run-unit-tests.ts';
import { runUnitTests } from './run-unit-tests.ts';
import type { RigConfig, RigOutput, RigRun } from './types.ts';

// A host with one worker runs each file slower than CI, and a test that passes there must not fail
// the push.
const slowHostTestTimeoutMs = 15_000;

export interface RelatedTestDeps extends UnitRunDeps {
  readonly sources: Readonly<RelatedTestSources>;

  readonly readWorkerCount: () => Promise<WorkerCount>;

  readonly output: RigOutput;
}

// The related run is the unit lane on the tests beside the changed files, in this process.
export async function runRelatedTests(
  args: readonly string[],
  config: RigConfig,
  run: RigRun,
  deps: Readonly<RelatedTestDeps>,
): Promise<number> {
  const options = parseRelatedTestArgs(args);

  if (options.kind === 'invalid') {
    deps.output.err(`rig related: ${options.message}\n`);

    return 2;
  }

  const plan = buildRelatedTestPlan(
    options.paths,
    resolveRelatedTests(options.paths, config, deps.sources),
  );

  if (plan.kind === 'skip') {
    deps.output.out(`rig related: ${plan.message}\n`);

    return 0;
  }

  const workers = await deps.readWorkerCount();

  if (workers.kind === 'invalid') {
    deps.output.err(`rig related: ${workers.message}\n`);

    return 2;
  }

  const timeoutArgs = workers.count === 1 ? [`--timeout=${slowHostTestTimeoutMs}`] : [];

  // bun test reads a bare argument as a name filter; the ./ makes it a path.
  const testArgs = [...timeoutArgs, ...plan.tests.map((path) => `./${path}`)];

  return runUnitTests(config, { workerCount: workers.count, extraArgs: testArgs }, run, deps);
}

type RelatedTestArgs =
  | { readonly kind: 'valid'; readonly paths: readonly string[] }
  | { readonly kind: 'invalid'; readonly message: string };

// parseArgs throws on an option it does not declare, which the caller reports as a refused input.
function parseRelatedTestArgs(args: readonly string[]): RelatedTestArgs {
  try {
    return {
      kind: 'valid',
      paths: parseArgs({ args: [...args], options: {}, allowPositionals: true }).positionals,
    };
  } catch (error) {
    return { kind: 'invalid', message: error instanceof Error ? error.message : String(error) };
  }
}

type RelatedTestPlan =
  | { readonly kind: 'run'; readonly tests: readonly string[] }
  | { readonly kind: 'skip'; readonly message: string };

const maxTestFiles = 50;

function buildRelatedTestPlan(paths: readonly string[], tests: readonly string[]): RelatedTestPlan {
  const shared = paths.find((path) => isSharedTestInput(path));

  if (shared !== undefined) {
    return {
      kind: 'skip',
      message: `skipped, because the branch changes ${shared}, a shared test helper or config; CI runs the full suite`,
    };
  }

  if (tests.length > maxTestFiles) {
    return {
      kind: 'skip',
      message: `skipped, because the branch has ${tests.length} related unit test files, over the cap of ${maxTestFiles}; CI runs the full suite`,
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
