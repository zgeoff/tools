import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';

// A repo whose root package.json declares `workspaces` keeps its tests in its packages.
export async function probeWorkspaceRepo(repoRoot: string): Promise<boolean> {
  const file = Bun.file(join(repoRoot, 'package.json'));

  if (!(await file.exists())) {
    return false;
  }

  const manifest: unknown = await file.json();

  return isRecord(manifest) && manifest['workspaces'] !== undefined;
}
