import type { BrowserRun } from './build-browser-run.ts';
import { buildBrowserRun } from './build-browser-run.ts';

export const runIDVariable = 'BROWSER_LANE_RUN_ID';
export const buildDirVariable = 'BROWSER_LANE_BUILD_DIR';

export function findBrowserRun(
  repoRoot: string,
  hostName: string,
  environment: Readonly<Record<string, string | undefined>>,
): BrowserRun | null {
  const runID = environment[runIDVariable];

  return runID === undefined || runID === '' ? null : buildBrowserRun(repoRoot, hostName, runID);
}
