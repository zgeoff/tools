import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-check-plan-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runPlan = (env: Readonly<Record<string, string>>) =>
    $`bun ${join(import.meta.dir, 'write-check-plan.ts')}`
      .cwd(directory)
      .env({ PATH: process.env['PATH'], GITHUB_OUTPUT: join(directory, 'output'), ...env })
      .nothrow()
      .quiet();

  return { directory, runPlan };
}

test('it writes the plan for the script names package.json defines to the step outputs', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true', test: 'true', 'test:e2e': 'true' } }),
  );

  const result = await ctx.runPlan({ SCRIPTS: 'lint test test:e2e', PART: 'all', LANE: '' });
  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(result.exitCode).toBe(0);

  expect(output).toBe(
    ['scripts= lint test test:e2e ', 'static= lint ', 'test= test ', 'lanes=["e2e"]', ''].join(
      '\n',
    ),
  );
});

test('it fails with an error and writes no outputs when a listed script is missing', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true' } }),
  );

  const result = await ctx.runPlan({ SCRIPTS: 'lint check', PART: 'all', LANE: '' });
  const wroteOutput = await Bun.file(join(ctx.directory, 'output')).exists();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    wroteOutput,
  }).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::package.json defines no script named: check. Pass the scripts input, or set the BUN_CHECK_SCRIPTS repo variable, to change the list.\n',
    wroteOutput: false,
  });
});

test('it fails with an error on a part it does not know', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true' } }),
  );

  const result = await ctx.runPlan({ SCRIPTS: 'lint', PART: 'everything', LANE: '' });

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 1,
    stdout:
      '::error::the plan step needs PART (one of all, static, test, lane) and GITHUB_OUTPUT.\n',
  });
});
