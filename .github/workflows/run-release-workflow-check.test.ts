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

test('it prints each fault of the shared release workflow and exits 1', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, '.github', 'workflows'), { recursive: true });

  await writeFile(
    join(ctx.directory, '.github', 'workflows', 'release-please.yml'),
    [
      'jobs:',
      '  release:',
      '    steps:',
      '      - name: Run release-please',
      '        uses: acme/release-action@abc123',
      '      - name: Auto-merge release PRs',
      '        run: bash merge-release-prs.sh',
      '      - name: Tag the merged release',
      '        uses: acme/release-action@abc123',
    ].join('\n'),
  );

  const result = await ctx.runCheck();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 1,
    stdout: [
      "the release job has no step named Check untagged releases against main's head",
      "the release job has no step named Check the merge against main's head",
      'the release job has no step named Pick the release outputs',
      '',
    ]
      .map((line) => (line === '' ? '' : `.github/workflows/release-please.yml: ${line}`))
      .join('\n'),
    stderr: '',
  });
});

test('it exits 2 when the repo has no shared release workflow', async () => {
  const ctx = await setupTest();
  const result = await ctx.runCheck();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 2,
    stdout: '',
  });

  expect(result.stderr.toString()).toStartWith('release-workflow: ENOENT');
});
