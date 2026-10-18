import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubBun } from './create-stub-bun.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { readWorkflowStep } from './read-workflow-step.ts';

// The steps of the checks job, read from the workflow, and a PATH whose bun is a tested stand-in
// that records each script, so each step runs for real without the scripts. A test that downloads
// puts its own curl stand-in in bin.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'bun-checks-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'bun-checks.yml');
  const bin = join(dir, 'bin');

  await mkdir(bin);
  await createStubBun(bin, join(dir, 'ran'));

  const pick = await readWorkflowStep(workflow, 'checks', 'Pick the check scripts');
  const setupShfmt = await readWorkflowStep(workflow, 'checks', 'Setup shfmt');
  const run = await readWorkflowStep(workflow, 'checks', 'Run the check scripts');

  return { dir, bin, pick, setupShfmt, run, path: `${bin}:${process.env['PATH']}` };
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

  await $`bash -c ${ctx.pick.run}`
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

  const result = await $`bash -c ${ctx.pick.run}`
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

  const result = await $`bash -c ${ctx.pick.run}`
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

  await $`bash -c ${ctx.run.run}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: ' lint check test ' })
    .quiet();

  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(ran).toBe('lint\ncheck\ntest\n');
});

test('it installs shfmt into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  const result = await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_SHFMT: 'false',
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

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  const result = await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_SHFMT: 'false',
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

test.each([
  ['the scripts run check', ' lint check test ', 'false', true],
  ['the caller asks for it', ' lint check:sync test ', 'true', true],
  ['neither holds', ' lint check:sync test ', 'false', false],
])('it installs shfmt only when %s', async (_label, scripts, setupShfmt, installs) => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      SCRIPTS: scripts,
      SETUP_SHFMT: setupShfmt,
      RUNNER_TEMP: ctx.dir,
      GITHUB_PATH: join(ctx.dir, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
    })
    .quiet();

  const installed = await Bun.file(join(ctx.dir, 'shfmt-bin/shfmt')).exists();

  expect(installed).toBe(installs);
});

test('it hands the picked list to the shfmt setup and the run through the workflow bindings', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

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

  // The caller's inputs: an empty scripts list and no setup-shfmt.
  const inputs: Record<string, string> = {
    [`\${{ inputs.scripts }}`]: '',
    [`\${{ inputs.setup-shfmt }}`]: 'false',
  };

  await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.dir)
    .env({
      PATH: ctx.path,
      SCRIPTS: inputs[ctx.pick.env['SCRIPTS'] ?? ''],
      GITHUB_OUTPUT: join(ctx.dir, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.dir, 'output'), 'utf8');

  // The pick step's output, under the expression a later step uses to read it.
  const outputs: Record<string, string> = {
    ...inputs,
    [`\${{ steps.${ctx.pick.id}.outputs.scripts }}`]: output.slice('scripts='.length, -1),
  };

  await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.dir)
    .env({
      ...ctx.setupShfmt.env,
      PATH: ctx.path,
      SCRIPTS: outputs[ctx.setupShfmt.env['SCRIPTS'] ?? ''],
      SETUP_SHFMT: outputs[ctx.setupShfmt.env['SETUP_SHFMT'] ?? ''],
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
      RUNNER_TEMP: ctx.dir,
      GITHUB_PATH: join(ctx.dir, 'github-path'),
    })
    .quiet();

  await $`bash -c ${ctx.run.run}`
    .cwd(ctx.dir)
    .env({ PATH: ctx.path, SCRIPTS: outputs[ctx.run.env['SCRIPTS'] ?? ''] })
    .quiet();

  const installed = await Bun.file(join(ctx.dir, 'shfmt-bin/shfmt')).exists();
  const ran = await readFile(join(ctx.dir, 'ran'), 'utf8');

  expect(installed).toBeTrue();
  expect(ran).toBe('audit\ndeadcode\nformat:check\nlint\ncheck\ntypecheck\ntest\n');
});
