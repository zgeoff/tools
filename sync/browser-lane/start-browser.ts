import { join } from 'node:path';
import { buildDirVariable, findBrowserRun, runIDVariable } from './find-browser-run.ts';

export interface BrowserStart {
  readonly repoRoot: string;

  readonly hostName: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly profileName: string;

  readonly readDirNames: (path: string) => Promise<readonly string[]>;

  readonly openView: (profileDir: string) => Promise<void>;
}

export async function startBrowser(start: BrowserStart): Promise<void> {
  const run = findBrowserRun(start.repoRoot, start.hostName, start.environment);

  if (run === null) {
    throw new Error(
      `the browser preload needs the run that the browser lane sets up, and ${runIDVariable} names none; run the suites with \`bun run test:browser\``,
    );
  }

  const buildDir = start.environment[buildDirVariable];

  if (buildDir !== undefined) {
    const entries = await start.readDirNames(buildDir);

    if (entries.length === 0) {
      throw new Error(
        `the browser run ${run.runID} has no build in ${buildDir}; the build:browser script writes it to ${buildDirVariable}`,
      );
    }
  }

  await start.openView(join(run.profilesDir, start.profileName));
}
