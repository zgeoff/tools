import { expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { $ } from 'bun';

test('it hands its arguments to the cleanup in src/, which refuses a run with one of them', async () => {
  const scriptPath = fileURLToPath(new URL('remove-retired-sync-files.sh', import.meta.url));

  const result = await $`bash ${scriptPath} tools`.cwd(tmpdir()).nothrow().quiet();

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
