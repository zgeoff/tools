import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunFolderPrefix } from '@zgeoff/testing/fs';
import { runBashScript } from '../test-utils/run-bash-script.ts';

interface SetupOptions {
  // The body the API returns; null: the API returns a null body.
  readonly body: string | null;
}

async function setupTest(options: Readonly<SetupOptions>) {
  const directory = await mkdtemp(join(import.meta.dir, readRunFolderPrefix('.test-pr-checks-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const stubs = join(directory, 'stubs');

  await mkdir(stubs);

  // The stand-in gh answers an API read with the body; the stand-in bun logs each call.
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
echo "bun $*" >> "$(dirname "$0")/calls.log"
`,
  );

  await writeFile(join(stubs, 'calls.log'), '');
  await writeFile(join(stubs, 'api-response.json'), JSON.stringify({ body: options.body }));

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

test('it checks the body that the API holds against the base and the head', async () => {
  const ctx = await setupTest({ body: '## Description\n\nText.\n' });

  const result = await ctx.run('check-pr-body.sh', {
    PR_NUMBER: '7',
    BASE_SHA: 'aaa111',
    HEAD_SHA: 'bbb222',
    GH_TOKEN: 'token',
  });

  const calls = await ctx.readCalls();
  const body = await readFile(join(ctx.directory, 'pr-body.md'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(body).toBe('## Description\n\nText.\n');

  expect(calls).toStrictEqual([
    'gh api repos/acme/widgets/pulls/7',
    'bun x @zgeoff/chex@9.9.9 pr-body --body-file <dir>/pr-body.md --base aaa111 --head bbb222',
  ]);
});

test('it checks an empty body when the API returns none', async () => {
  const ctx = await setupTest({ body: null });

  await ctx.run('check-pr-body.sh', {
    PR_NUMBER: '7',
    BASE_SHA: 'aaa111',
    HEAD_SHA: 'bbb222',
    GH_TOKEN: 'token',
  });

  const body = await readFile(join(ctx.directory, 'pr-body.md'), 'utf8');

  expect(body).toBe('');
});
