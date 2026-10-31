import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { removePath } from '../packages/rig/src/browser/remove-path.ts';
import { buildWarmUpSuite } from './build-warm-up-suite.ts';
import { createTrackedRepo } from './create-tracked-repo.ts';

export interface BrowserWarmUpDependencies {
  readonly runRigBrowser: (repoRoot: string) => Promise<unknown>;
}

// A fresh CI runner's first Chrome start took 0.9 to 13 s and its second 0.3 s, so a journey
// that started the runner's first Chrome ran past the e2e limit.
export async function runBrowserWarmUp(
  repoRoot: string,
  chromeRunsDir: string,
  dependencies: BrowserWarmUpDependencies,
): Promise<void> {
  const markPath = join(repoRoot, 'warm-up.mark');

  // rig runs only the test files that git tracks, and exits 0 before Chrome starts when a lane
  // has none.
  await createTrackedRepo(repoRoot, {
    'package.json': '{}\n',
    'warm-up.browser.test.ts': buildWarmUpSuite(markPath),
  });

  try {
    await dependencies.runRigBrowser(repoRoot);

    if (!existsSync(markPath)) {
      throw new Error('the Chrome warm-up ran no browser test');
    }
  } finally {
    await removePath(chromeRunsDir);
  }
}
