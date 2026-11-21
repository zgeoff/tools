import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { runBashScript } from '../test-utils/run-bash-script.ts';

interface SetupOptions {
  // The body the API returns; null: the API returns a null body.
  readonly body: string | null;

  // What the chex stand-in prints for the tick-chex subcommand.
  readonly ticked?: string;
}

async function setupTest(options: Readonly<SetupOptions>) {
  const directory = await mkdtemp(join(import.meta.dir, readRunFolderPrefix('.test-pr-checks-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stubs = join(directory, 'stubs');

  await mkdir(stubs);

  // The stand-in gh answers an API read with the body; the stand-in bun logs each call and prints the ticked body for tick-chex.
  await writeFile(
    join(stubs, 'gh'),
    `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "gh $*" >> "$dir/calls.log"
if [ "$1" = api ]; then
  cat "$dir/api-response.json"
fi
`,
  );

  await writeFile(
    join(stubs, 'bun'),
    `#!/usr/bin/env bash
dir=$(dirname "$0")
echo "bun $*" >> "$dir/calls.log"
if [ "$3" = pr-body ] && [ "$4" = tick-chex ]; then
  cat "$dir/ticked.md"
fi
`,
  );

  await writeFile(join(stubs, 'calls.log'), '');
  await writeFile(join(stubs, 'api-response.json'), JSON.stringify({ body: options.body }));
  await writeFile(join(stubs, 'ticked.md'), options.ticked ?? options.body ?? '');

  for (const name of ['gh', 'bun']) {
    await chmod(join(stubs, name), 0o755);
  }

  const run = (script: string, env: Readonly<Record<string, string>>) =>
    runBashScript({
      script: fileURLToPath(new URL(script, import.meta.url)),
      args: [],
      stubDirectory: stubs,
      env: { RUNNER_TEMP: directory, CHEX: '@zgeoff/chex@9.9.9', REPO: 'acme/widgets', ...env },
    });

  const readCalls = async () => {
    const log = await readFile(join(stubs, 'calls.log'), 'utf8');

    return log
      .split('\n')
      .filter(Boolean)
      .map((call) => call.replaceAll(directory, '<dir>'));
  };

  return { directory, run, readCalls };
}

test('it ticks the box and writes the body back when the docs checks passed', async () => {
  const ctx = await setupTest({ body: '- [ ] chex\n', ticked: '- [x] chex\n' });

  const result = await ctx.run('tick-chex-box.sh', {
    PR_NUMBER: '7',
    GH_TOKEN: 'token',
    DOCS_OUTCOME: 'success',
  });

  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(0);

  expect(calls).toStrictEqual([
    'gh api repos/acme/widgets/pulls/7',
    'bun x @zgeoff/chex@9.9.9 pr-body tick-chex --body-file <dir>/body-before.md --passed',
    'gh pr edit 7 --repo acme/widgets --body-file <dir>/body-after.md',
  ]);
});

test('it leaves the body alone when the box already shows the result', async () => {
  const ctx = await setupTest({ body: '- [x] chex\n' });

  const result = await ctx.run('tick-chex-box.sh', {
    PR_NUMBER: '7',
    GH_TOKEN: 'token',
    DOCS_OUTCOME: 'success',
  });

  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(0);
  expect(calls.filter((call) => call.startsWith('gh pr edit'))).toStrictEqual([]);
});

test('it unticks the box and fails the run when the docs checks failed', async () => {
  const ctx = await setupTest({ body: '- [x] chex\n', ticked: '- [ ] chex\n' });

  const result = await ctx.run('tick-chex-box.sh', {
    PR_NUMBER: '7',
    GH_TOKEN: 'token',
    DOCS_OUTCOME: 'failure',
  });

  const calls = await ctx.readCalls();

  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('the chex box is unticked');

  expect(calls).toStrictEqual([
    'gh api repos/acme/widgets/pulls/7',
    'bun x @zgeoff/chex@9.9.9 pr-body tick-chex --body-file <dir>/body-before.md --failed',
    'gh pr edit 7 --repo acme/widgets --body-file <dir>/body-after.md',
  ]);
});
