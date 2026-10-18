import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import invariant from 'tiny-invariant';

// The run step of the checks job, read from the workflow, and a bun on the PATH that records each
// script name it gets, so the step runs for real without the scripts.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'bun-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  // The step's run block is the last block of the file, indented 10 spaces.
  const marker = '      - name: Run the check scripts\n';
  const block = text.slice(text.indexOf('run: |\n', text.indexOf(marker)) + 'run: |\n'.length);
  const lines = block.split('\n');

  invariant(
    text.includes(marker) && lines.every((line) => line === '' || line.startsWith(' '.repeat(10))),
    'the Run the check scripts step must end bun-checks.yml',
  );

  const bin = join(dir, 'bin');

  await mkdir(bin);
  await writeFile(join(bin, 'bun'), `#!/bin/sh\necho "$2" >> "${join(dir, 'ran')}"\n`);
  await chmod(join(bin, 'bun'), 0o755);

  return {
    dir,
    script: lines.map((line) => line.slice(10)).join('\n'),
    path: `${bin}:${process.env['PATH']}`,
  };
}

test('it runs check in the standard list when the repo defines the script', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'package.json'),
    JSON.stringify({
      scripts: {
        audit: 'true',
        deadcode: 'true',
        'format:check': 'true',
        lint: 'true',
        check: 'zgeoff-check',
        typecheck: 'true',
        test: 'true',
      },
    }),
  );

  await $`bash -c ${ctx.script}`.cwd(ctx.dir).env({ PATH: ctx.path, SCRIPTS: '' }).quiet();

  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(ran).toBe('audit\ndeadcode\nformat:check\nlint\ncheck\ntypecheck\ntest\n');
});

test('it skips check in the standard list with a notice when the repo has no check script', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.dir, 'package.json'),
    JSON.stringify({
      scripts: {
        audit: 'true',
        deadcode: 'true',
        'format:check': 'true',
        lint: 'true',
        typecheck: 'true',
        test: 'true',
      },
    }),
  );

  const result = await $`bash -c ${ctx.script}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: '' })
    .quiet();

  expect(result.stdout.toString()).toInclude(
    '::notice::check skipped, because package.json has no check script; add "check": "zgeoff-check" to run it.',
  );

  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(ran).toBe('audit\ndeadcode\nformat:check\nlint\ntypecheck\ntest\n');
});

test('it fails before any script runs when a listed check script is missing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), JSON.stringify({ scripts: { lint: 'true' } }));

  const result = await $`bash -c ${ctx.script}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: 'lint check' })
    .nothrow()
    .quiet();

  expect(result.exitCode).toBe(1);

  const ran = await Bun.file(join(ctx.dir, 'ran')).exists();

  expect(ran).toBeFalse();
});
