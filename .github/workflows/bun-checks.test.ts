import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readWorkflowStep } from './read-workflow-step.ts';

// The steps of the checks job, read from the workflow, and a PATH whose bun records each script
// name it gets and whose curl writes a fixed body to its -o path, so each step runs for real
// without the scripts or the network.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'bun-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'bun-checks.yml');
  const bin = join(dir, 'bin');

  await mkdir(bin);
  await writeFile(join(bin, 'bun'), `#!/bin/sh\necho "$2" >> "${join(dir, 'ran')}"\n`);
  await chmod(join(bin, 'bun'), 0o755);
  await writeFile(join(bin, 'curl'), `#!/bin/sh\nprintf 'fake shfmt\\n' > "$3"\n`);
  await chmod(join(bin, 'curl'), 0o755);

  const pick = await readWorkflowStep(workflow, 'checks', 'Pick the check scripts');
  const setupShfmt = await readWorkflowStep(workflow, 'checks', 'Setup shfmt');
  const run = await readWorkflowStep(workflow, 'checks', 'Run the check scripts');

  return { dir, pick, setupShfmt, run, path: `${bin}:${process.env['PATH']}` };
}

test('it picks check in the standard list when the repo defines the script', async () => {
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

  await $`bash -c ${ctx.pick}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: '', GITHUB_OUTPUT: join(ctx.dir, 'output') })
    .quiet();

  const output = await readFile(join(ctx.dir, 'output'), 'utf8');

  expect(output).toBe('scripts= audit deadcode format:check lint check typecheck test \n');
});

test('it leaves check out of the standard list with a notice when the repo has no check script', async () => {
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

  const result = await $`bash -c ${ctx.pick}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: '', GITHUB_OUTPUT: join(ctx.dir, 'output') })
    .quiet();

  const output = await readFile(join(ctx.dir, 'output'), 'utf8');

  expect(result.stdout.toString()).toInclude(
    '::notice::check skipped, because package.json has no check script; add "check": "zgeoff-check" to run it.',
  );

  expect(output).toBe('scripts= audit deadcode format:check lint typecheck test \n');
});

test('it fails the pick when a listed script is missing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dir, 'package.json'), JSON.stringify({ scripts: { lint: 'true' } }));

  const result = await $`bash -c ${ctx.pick}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: 'lint check', GITHUB_OUTPUT: join(ctx.dir, 'output') })
    .nothrow()
    .quiet();

  const wroteOutput = await Bun.file(join(ctx.dir, 'output')).exists();

  expect(result.exitCode).toBe(1);
  expect(wroteOutput).toBeFalse();
});

test('it runs each picked script in order', async () => {
  const ctx = await setupTest();

  await $`bash -c ${ctx.run}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: ' lint check test ' })
    .quiet();

  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(ran).toBe('lint\ncheck\ntest\n');
});

test('it installs shfmt into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  const result = await $`bash -c ${ctx.setupShfmt}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      RUNNER_TEMP: ctx.dir,
      GITHUB_PATH: join(ctx.dir, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
    })
    .nothrow()
    .quiet();

  const installed = await readFile(join(ctx.dir, 'shfmt-bin/shfmt'), 'utf8');
  const stats = await stat(join(ctx.dir, 'shfmt-bin/shfmt'));
  const githubPath = await readFile(join(ctx.dir, 'github-path'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(installed).toBe('fake shfmt\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.dir, 'shfmt-bin')}\n`);
});

test('it installs nothing when the download fails its checksum', async () => {
  const ctx = await setupTest();

  const result = await $`bash -c ${ctx.setupShfmt}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      RUNNER_TEMP: ctx.dir,
      GITHUB_PATH: join(ctx.dir, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: '0'.repeat(64),
    })
    .nothrow()
    .quiet();

  const installed = await Bun.file(join(ctx.dir, 'shfmt-bin/shfmt')).exists();
  const wrotePath = await Bun.file(join(ctx.dir, 'github-path')).exists();

  expect(result.exitCode).not.toBe(0);
  expect(installed).toBeFalse();
  expect(wrotePath).toBeFalse();
});
