import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-release-workflow-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runCheck = () =>
    $`bun ${join(import.meta.dir, 'run-release-workflow-check.ts')}`
      .cwd(directory)
      .nothrow()
      .quiet();

  return { directory, runCheck };
}

test('it prints each fault of the main workflow and exits 1', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.github', 'workflows'), { recursive: true });

  await writeFile(
    join(ctx.directory, '.github', 'workflows', 'main.yml'),
    [
      'jobs:',
      '  release:',
      '    steps:',
      '      - name: Run release-please',
      '        uses: acme/release-action@abc123',
      '      - name: Tag the merged release',
      '        uses: acme/release-action@abc123',
      '        with:',
      `          token: \${{ steps.app-token.outputs.token }}`,
      '',
    ].join('\n'),
  );

  const result = await ctx.runCheck();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '.github/workflows/main.yml: Tag the merged release must set skip-github-pull-request: true\n',
    stderr: '',
  });
});

test('it exits 2 when the repo has no main workflow', async () => {
  const ctx = await setupTest();
  const result = await ctx.runCheck();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 2,
    stdout: '',
  });

  expect(result.stderr.toString()).toStartWith('release-workflow: ENOENT');
});
