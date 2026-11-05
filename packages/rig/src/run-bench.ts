import { basename, join } from 'node:path';
import { collectBenchComparison } from './bench/collect-bench-comparison.ts';
import { formatBenchComparison } from './bench/format-bench-comparison.ts';
import { parseBenchReport } from './bench/parse-bench-report.ts';
import type { ParsedBenchReport } from './bench/parse-bench-report.ts';
import { pickBenchExitCode } from './bench/pick-bench-exit-code.ts';
import { readBenchArgs } from './bench/read-bench-args.ts';
import { pickExitCodeAfterTests } from './browser/pick-exit-code-after-tests.ts';
import { buildDietCommand } from './build-diet-command.ts';
import { buildProgramLaneHooks } from './build-program-lane-hooks.ts';
import { collectBenchFiles } from './collect-bench-files.ts';
import type { LaneHooks } from './lane-hooks.ts';
import { makeRepoLaneHooks } from './make-repo-lane-hooks.ts';
import { runLaneHooks } from './run-lane-hooks.ts';
import type { ProgramBuildDeps } from './run-program-builds.ts';
import { runProgramBuilds } from './run-program-builds.ts';
import type { RigConfig, RigRun } from './types.ts';

export interface BenchDeps extends ProgramBuildDeps {
  readonly dietScript: string;

  // The script that runs one bench file.
  readonly benchScript: string;

  readonly readConfig: (repoRoot: string) => Promise<RigConfig>;

  readonly probeWorkspaceRepo: (repoRoot: string) => Promise<boolean>;

  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly importModule: (path: string) => Promise<unknown>;

  // Makes a new folder for one run's reports and base checkout.
  readonly createWorkFolder: (repoRoot: string) => Promise<string>;

  readonly readText: (path: string) => Promise<string | null>;

  readonly removeFolder: (path: string) => Promise<void>;
}

interface BenchSide {
  readonly root: string;

  readonly config: RigConfig;

  readonly files: readonly string[];

  readonly reportPath: string;
}

// Builds each program once, as `rig e2e` does, then runs each bench file in a process of its own,
// between the start and stop hooks of the bench lane when the config names one. A base ref runs
// the same way from a checkout of that ref, with that checkout's config.
export async function runBench(
  args: readonly string[],
  config: RigConfig,
  run: RigRun,
  deps: BenchDeps,
): Promise<number> {
  const parsed = await readBenchArgs(args);

  if (parsed.kind === 'refused') {
    deps.output.err(`rig bench: ${parsed.reason}\n`);

    return 2;
  }

  const benchFiles = await readBenchFiles(run.repoRoot, deps);

  const files = pickNamedFiles(benchFiles, parsed.name);

  if (files.length === 0) {
    return reportNoBenchmark(parsed.name, benchFiles, deps);
  }

  const workFolder = await deps.createWorkFolder(run.repoRoot);

  const head: BenchSide = {
    root: run.repoRoot,
    config,
    files,
    reportPath: join(workFolder, 'head.jsonl'),
  };

  try {
    const exitCode =
      parsed.baseRef === null
        ? await runHeadBench(head, run, deps)
        : await runBenchComparison(
            { baseRef: parsed.baseRef, name: parsed.name, workFolder, head },
            run,
            deps,
          );

    return pickExitCodeAfterTests(exitCode, run.signal.aborted);
  } finally {
    await deps.removeFolder(workFolder);
  }
}

async function readBenchFiles(root: string, deps: BenchDeps): Promise<readonly string[]> {
  const isWorkspaceRepo = await deps.probeWorkspaceRepo(root);
  const trackedFiles = await deps.readTrackedFiles(root);

  return collectBenchFiles(trackedFiles, isWorkspaceRepo);
}

function pickNamedFiles(benchFiles: readonly string[], name: string | null): readonly string[] {
  return name === null ? benchFiles : benchFiles.filter((file) => toBenchName(file) === name);
}

function toBenchName(file: string): string {
  return basename(file, '.bench.ts');
}

function reportNoBenchmark(
  name: string | null,
  benchFiles: readonly string[],
  deps: BenchDeps,
): number {
  if (name === null) {
    deps.output.out('rig: the repo has no benchmarks\n');

    return 0;
  }

  const names = benchFiles.map((file) => toBenchName(file)).join(', ');

  deps.output.err(`rig bench: no benchmark named "${name}"; the benchmarks are ${names}\n`);

  return 1;
}

async function runHeadBench(head: BenchSide, run: RigRun, deps: BenchDeps): Promise<number> {
  const exitCode = await runBenchSide(head, run, deps);
  const report = await readBenchReport(head.reportPath, deps);

  if (report.kind === 'refused') {
    deps.output.err(`rig bench: ${report.reason}\n`);

    return 1;
  }

  return pickBenchExitCode([exitCode], report.entries);
}

// Runs one side's bench files against that side's root, so a base checkout builds its own programs
// and starts its own lane.
async function runBenchSide(side: BenchSide, run: RigRun, deps: BenchDeps): Promise<number> {
  if (side.files.length === 0) {
    return 0;
  }

  const sideRun: RigRun = { ...run, repoRoot: side.root };

  const buildExitCode = await runProgramBuilds(side.config.programs, sideRun, deps);

  if (buildExitCode !== 0) {
    return buildExitCode;
  }

  const hooks = buildProgramLaneHooks(
    makeBenchHooks(side, sideRun, deps),
    side.root,
    side.config.programs,
  );

  return runLaneHooks(side.files, hooks);
}

function makeBenchHooks(side: BenchSide, run: RigRun, deps: BenchDeps): LaneHooks {
  const lane = side.config.lanes.find((candidate) => candidate.name === side.config.benchLane);

  const laneHooks: Pick<LaneHooks, 'start' | 'stop'> =
    lane === undefined
      ? {
          start: () => Promise.resolve({ kind: 'proceed', environment: run.environment }),
          stop: () => Promise.resolve(),
        }
      : makeRepoLaneHooks({
          context: { repoRoot: run.repoRoot, lane, runID: run.runID, environment: run.environment },
          dietScript: deps.dietScript,
          parallel: 1,
          signal: run.signal,
          importModule: deps.importModule,
          runCommand: deps.runCommand,
        });

  return {
    ...laneHooks,
    run: async (files, environment) => {
      let exitCode = 0;

      for (const file of files) {
        const fileExitCode = await deps.runCommand(
          buildDietCommand(deps.dietScript, lane?.memory ?? null, [
            'bun',
            deps.benchScript,
            join(run.repoRoot, file),
            '--report',
            side.reportPath,
          ]),
          { cwd: run.repoRoot, environment, signal: run.signal },
        );

        exitCode = fileExitCode === 0 ? exitCode : 1;
      }

      return exitCode;
    },
  };
}

// A bench file that failed before it measured anything appends no report.
async function readBenchReport(path: string, deps: BenchDeps): Promise<ParsedBenchReport> {
  const text = await deps.readText(path);

  return parseBenchReport(text ?? '');
}

interface BenchComparison {
  readonly baseRef: string;

  readonly name: string | null;

  readonly workFolder: string;

  readonly head: BenchSide;
}

async function runBenchComparison(
  comparison: BenchComparison,
  run: RigRun,
  deps: BenchDeps,
): Promise<number> {
  const baseRoot = join(comparison.workFolder, 'base');

  const addExitCode = await deps.runCommand(
    ['git', 'worktree', 'add', '--detach', baseRoot, comparison.baseRef],
    { cwd: run.repoRoot, environment: run.environment, signal: run.signal },
  );

  if (addExitCode !== 0) {
    deps.output.err(`rig bench: could not check out "${comparison.baseRef}"\n`);

    return 1;
  }

  try {
    return await runCheckedOutComparison(comparison, baseRoot, run, deps);
  } finally {
    // An aborted run still removes the checkout, so the removal gets a signal of its own.
    await deps.runCommand(['git', 'worktree', 'remove', '--force', baseRoot], {
      cwd: run.repoRoot,
      environment: run.environment,
      signal: new AbortController().signal,
    });
  }
}

async function runCheckedOutComparison(
  comparison: BenchComparison,
  baseRoot: string,
  run: RigRun,
  deps: BenchDeps,
): Promise<number> {
  const installExitCode = await deps.runCommand(['bun', 'install', '--frozen-lockfile'], {
    cwd: baseRoot,
    environment: run.environment,
    signal: run.signal,
  });

  if (installExitCode !== 0) {
    deps.output.err(`rig bench: bun install failed in the checkout of "${comparison.baseRef}"\n`);

    return 1;
  }

  const baseConfig = await deps.readConfig(baseRoot);
  const baseBenchFiles = await readBenchFiles(baseRoot, deps);

  const base: BenchSide = {
    root: baseRoot,
    config: baseConfig,
    files: pickNamedFiles(baseBenchFiles, comparison.name),
    reportPath: join(comparison.workFolder, 'base.jsonl'),
  };

  const baseExitCode = await runBenchSide(base, run, deps);
  const headExitCode = await runBenchSide(comparison.head, run, deps);
  const baseReport = await readBenchReport(base.reportPath, deps);
  const headReport = await readBenchReport(comparison.head.reportPath, deps);

  if (baseReport.kind === 'refused') {
    deps.output.err(`rig bench: ${baseReport.reason}\n`);

    return 1;
  }

  if (headReport.kind === 'refused') {
    deps.output.err(`rig bench: ${headReport.reason}\n`);

    return 1;
  }

  deps.output.out(
    formatBenchComparison(collectBenchComparison(baseReport.entries, headReport.entries)),
  );

  return pickBenchExitCode([headExitCode, baseExitCode], headReport.entries);
}
