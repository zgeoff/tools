import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'remove-retired-sync-files-stub-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const scriptPath = fileURLToPath(new URL('remove-retired-sync-files.sh', import.meta.url));

  return { directory, scriptPath };
}

test('it hands its arguments to the cleanup in src/, which refuses a run with one of them', async () => {
  const ctx = await setupTest();
  const result = await $`bash ${ctx.scriptPath} tools`.cwd(ctx.directory).nothrow().quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr:
      'usage: remove-retired-sync-files.sh <tools-checkout> <synced> [skip [copied [skills-checkout]]]\n',
  });
});
