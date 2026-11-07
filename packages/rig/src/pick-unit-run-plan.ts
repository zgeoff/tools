import type { TestRun } from './collect-test-runs.ts';
import { collectTestRuns } from './collect-test-runs.ts';
import { findSingleRunFlag } from './find-single-run-flag.ts';
import type { RigConfig } from './types.ts';

export interface UnitRunPlanRequest {
  readonly flags: readonly string[];

  // The unit tests to run, relative to the repo root.
  readonly tests: readonly string[];

  // True when the run takes the whole unit lane, so the root run finds its own tests.
  readonly isDiscovery: boolean;
}

export type UnitRunPlan =
  | { readonly kind: 'refused'; readonly message: string }
  | { readonly kind: 'runs'; readonly testRuns: readonly TestRun[] };

export function pickUnitRunPlan(
  config: RigConfig,
  request: UnitRunPlanRequest,
  trackedFiles: readonly string[],
): UnitRunPlan {
  const testRuns = collectTestRuns({
    bunfigs: config.bunfigs,
    trackedFiles,
    tests: request.tests,
    isDiscovery: request.isDiscovery,
  });

  const singleRunFlag = findSingleRunFlag(request.flags);

  if (singleRunFlag === undefined) {
    return { kind: 'runs', testRuns };
  }

  if (testRuns.length > 1) {
    return {
      kind: 'refused',
      message: `rig: ${singleRunFlag.flag} needs the tests in one bun test run, and these tests need ${testRuns.length}, one for each bunfig; name the tests of one bunfig\n`,
    };
  }

  const packageFolder = testRuns.find((testRun) => testRun.folder !== '')?.folder;

  if (singleRunFlag.holdsPath && packageFolder !== undefined) {
    return {
      kind: 'refused',
      message: `rig: ${singleRunFlag.flag} holds a path, and these tests run from ${packageFolder} under its own bunfig.toml, so the path would resolve there; run bun test from that folder\n`,
    };
  }

  return { kind: 'runs', testRuns };
}
