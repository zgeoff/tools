import { join } from 'node:path';

export interface BrowserRun {
  readonly runID: string;

  readonly runsDir: string;

  readonly runDir: string;

  readonly buildDir: string;

  readonly profilesDir: string;
}

// The run's folders sit in the repo's git-ignored cache, never in TMPDIR, because a host's TMPDIR
// can sit in memory, and each Chrome profile takes megabytes. A container that mounts the repo
// sees other process IDs than its host, so each host name keeps its own runs.
export function buildBrowserRun(repoRoot: string, hostName: string, runID: string): BrowserRun {
  const runsDir = join(repoRoot, 'node_modules', '.cache', 'browser-lane', hostName);
  const runDir = join(runsDir, runID);

  return {
    runID,
    runsDir,
    runDir,
    buildDir: join(runDir, 'build'),
    profilesDir: join(runDir, 'profiles'),
  };
}
