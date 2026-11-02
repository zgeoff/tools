import { runGit } from '../../rig/test-utils/run-git.ts';

export async function runProbeGit(directory: string): Promise<void> {
  await runGit(directory, {}, ['status']);
}
