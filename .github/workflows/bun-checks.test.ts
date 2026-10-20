import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubBun } from './create-stub-bun.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';

// The steps of the checks job, read from the workflow, and a PATH whose bun is a tested stand-in
// that records each script, so each step runs for real without the scripts. A test that downloads
// puts its own curl stand-in in bin.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'bun-checks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'bun-checks.yml');
  const bin = join(directory, 'bin');

  await mkdir(bin);
  await createStubBun(bin, join(directory, 'ran'));

  const pick = await loadWorkflowStep(workflow, 'static', 'Pick the check scripts');
  const setupShfmt = await loadWorkflowStep(workflow, 'static', 'Setup shfmt');
  const setupActionlint = await loadWorkflowStep(workflow, 'static', 'Setup actionlint');
  const run = await loadWorkflowStep(workflow, 'static', 'Run the check scripts');

  return {
    directory,
    bin,
    pick,
    setupShfmt,
    setupActionlint,
    run,
    path: `${bin}:${process.env['PATH']}`,
  };
}

test('it picks check in the standard list when the repo defines the script', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
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
    .cwd(ctx.directory)
    .env({ PATH: ctx.path, SCRIPTS: '', PART: 'all', GITHUB_OUTPUT: join(ctx.directory, 'output') })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(output).toBe(
    [
      'scripts= audit deadcode format:check lint check typecheck test ',
      'static= audit deadcode format:check lint check typecheck ',
      'test= test ',
      'lanes=[]',
      '',
    ].join('\n'),
  );
});

test('it leaves check out of the standard list with a notice when the repo has no check script', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
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
    .cwd(ctx.directory)
    .env({ PATH: ctx.path, SCRIPTS: '', PART: 'all', GITHUB_OUTPUT: join(ctx.directory, 'output') })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(result.stdout.toString()).toInclude(
    '::notice::check skipped, because package.json has no check script; add "check": "zgeoff-check" to run it.',
  );

  expect(output).toBe(
    [
      'scripts= audit deadcode format:check lint typecheck test ',
      'static= audit deadcode format:check lint typecheck ',
      'test= test ',
      'lanes=[]',
      '',
    ].join('\n'),
  );
});

test('it fails the pick when a listed script is missing', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true' } }),
  );

  const result = await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: 'lint check',
      PART: 'all',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .nothrow()
    .quiet();

  const wroteOutput = await Bun.file(join(ctx.directory, 'output')).exists();

  expect(result.exitCode).toBe(1);
  expect(wroteOutput).toBeFalse();
});

test('it runs each picked script in order', async () => {
  const ctx = await setupTest();

  await $`bash -c ${ctx.run.run}`
    .cwd(ctx.directory)
    .env({ PATH: ctx.path, SCRIPTS: ' lint check test ' })
    .quiet();

  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(ran).toBe('lint\ncheck\ntest\n');
});

test('it installs shfmt into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  const result = await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_SHFMT: 'false',
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
    })
    .nothrow()
    .quiet();

  const installed = await readFile(join(ctx.directory, 'shfmt-bin/shfmt'), 'utf8');
  const stats = await stat(join(ctx.directory, 'shfmt-bin/shfmt'));
  const githubPath = await readFile(join(ctx.directory, 'github-path'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(installed).toBe('fake shfmt\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.directory, 'shfmt-bin')}\n`);
});

test('it installs nothing when the download fails its checksum', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  const result = await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_SHFMT: 'false',
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: '0'.repeat(64),
    })
    .nothrow()
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'shfmt-bin/shfmt')).exists();
  const wrotePath = await Bun.file(join(ctx.directory, 'github-path')).exists();

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
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: scripts,
      SETUP_SHFMT: setupShfmt,
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      SHFMT_VERSION: 'v3.13.1',
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
    })
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'shfmt-bin/shfmt')).exists();

  expect(installed).toBe(installs);
});

test('it hands the picked list to the shfmt setup and the run through the workflow bindings', async () => {
  const ctx = await setupTest();

  await createStubCurl(ctx.bin, 'fake shfmt\n');

  await writeFile(
    join(ctx.directory, 'package.json'),
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

  const inputs: Record<string, string> = {
    [`\${{ inputs.scripts }}`]: '',
    [`\${{ inputs.setup-shfmt }}`]: 'false',
  };

  await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: inputs[ctx.pick.env['SCRIPTS'] ?? ''],
      PART: 'static',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  // The pick step's output, under the expression a later step uses to read it.
  const outputs: Record<string, string> = {
    ...inputs,
    [`\${{ steps.${ctx.pick.id}.outputs.scripts }}`]:
      /^scripts=(?<list>.*)$/mu.exec(output)?.groups?.['list'] ?? '',
  };

  await $`bash -c ${ctx.setupShfmt.run}`
    .cwd(ctx.directory)
    .env({
      ...ctx.setupShfmt.env,
      PATH: ctx.path,
      SCRIPTS: outputs[ctx.setupShfmt.env['SCRIPTS'] ?? ''],
      SETUP_SHFMT: outputs[ctx.setupShfmt.env['SETUP_SHFMT'] ?? ''],
      SHFMT_SHA256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
    })
    .quiet();

  await $`bash -c ${ctx.run.run}`
    .cwd(ctx.directory)
    .env({ PATH: ctx.path, SCRIPTS: outputs[ctx.run.env['SCRIPTS'] ?? ''] })
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'shfmt-bin/shfmt')).exists();
  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(installed).toBeTrue();
  expect(ran).toBe('audit\ndeadcode\nformat:check\nlint\ncheck\ntypecheck\n');
});

test('it installs actionlint from the release archive into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });
  await writeFile(join(ctx.directory, 'release/README.md'), 'fake readme\n');

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint README.md`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.bin, archive);

  const result = await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_ACTIONLINT: 'false',
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      ACTIONLINT_VERSION: '1.7.12',
      ACTIONLINT_SHA256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
    })
    .nothrow()
    .quiet();

  const installed = await readdir(join(ctx.directory, 'actionlint-bin'));
  const binary = await readFile(join(ctx.directory, 'actionlint-bin/actionlint'), 'utf8');
  const stats = await stat(join(ctx.directory, 'actionlint-bin/actionlint'));
  const githubPath = await readFile(join(ctx.directory, 'github-path'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(installed).toStrictEqual(['actionlint']);
  expect(binary).toBe('fake actionlint\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.directory, 'actionlint-bin')}\n`);
});

test('it installs no actionlint when the archive fails its checksum', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.bin, archive);

  const result = await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: ' lint check test ',
      SETUP_ACTIONLINT: 'false',
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      ACTIONLINT_VERSION: '1.7.12',
      ACTIONLINT_SHA256: '0'.repeat(64),
    })
    .nothrow()
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'actionlint-bin/actionlint')).exists();
  const wrotePath = await Bun.file(join(ctx.directory, 'github-path')).exists();

  expect(result.exitCode).not.toBe(0);
  expect(installed).toBeFalse();
  expect(wrotePath).toBeFalse();
});

test.each([
  ['the scripts run check', ' lint check test ', 'false', true],
  ['the caller asks for it', ' test ', 'true', true],
  ['the scripts leave check out', ' lint check:sync test ', 'false', false],
])('it installs actionlint only when %s', async (_label, scripts, setupActionlint, installs) => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.bin, archive);

  await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: scripts,
      SETUP_ACTIONLINT: setupActionlint,
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
      ACTIONLINT_VERSION: '1.7.12',
      ACTIONLINT_SHA256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
    })
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'actionlint-bin/actionlint')).exists();

  expect(installed).toBe(installs);
});

test('it hands the picked list to the actionlint setup through the workflow bindings', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.bin, archive);

  await writeFile(
    join(ctx.directory, 'package.json'),
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
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: '',
      PART: 'static',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  const outputs: Record<string, string> = {
    [`\${{ steps.${ctx.pick.id}.outputs.scripts }}`]:
      /^scripts=(?<list>.*)$/mu.exec(output)?.groups?.['list'] ?? '',
  };

  await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      ...ctx.setupActionlint.env,
      PATH: ctx.path,
      SCRIPTS: outputs[ctx.setupActionlint.env['SCRIPTS'] ?? ''],
      ACTIONLINT_SHA256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
    })
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'actionlint-bin/actionlint')).exists();

  expect(installed).toBeTrue();
});

test('it gives a caller that passes no time limit the synced caller fallback', async () => {
  const reusableText = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const callerText = await readFile(
    join(import.meta.dir, '../../sync/workflow-callers/pr.yml'),
    'utf8',
  );

  const reusable: unknown = Bun.YAML.parse(reusableText);
  const caller: unknown = Bun.YAML.parse(callerText);

  expect(reusable).toMatchObject({
    on: { workflow_call: { inputs: { 'timeout-minutes': { default: 20 } } } },
  });

  expect(caller).toMatchObject({
    jobs: {
      pr: {
        with: { 'timeout-minutes': `\${{ fromJSON(vars.BUN_CHECK_TIMEOUT_MINUTES || '20') }}` },
      },
    },
  });
});

test('it checks out the full history without the file contents, so the branch checks and the scan find every commit', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  const checkout: unknown = expect.objectContaining({
    name: 'Checkout',
    with: { 'fetch-depth': 0, filter: 'blob:none' },
  });

  const steps: unknown = expect.arrayContaining([checkout]);

  expect(workflow).toMatchObject({ jobs: { gitleaks: { steps }, checks: { steps } } });
});

test('it restores the install cache keyed on the lockfile, or the newest older cache for the runner OS, before it installs', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  const cache: unknown = expect.objectContaining({
    name: 'Cache bun install',
    with: expect.objectContaining({
      path: '~/.bun/install/cache',
      key: `bun-install-\${{ runner.os }}-\${{ hashFiles('bun.lock') }}`,
      'restore-keys': `bun-install-\${{ runner.os }}-`,
    }),
  });

  const install: unknown = expect.objectContaining({ name: 'Install' });

  expect(workflow).toMatchObject({
    jobs: { checks: { steps: expect.arrayContaining([cache, install]) } },
  });
});

// The expression the private checks job runs on; each public job runs on its negation.
const privateProfile =
  '(github.event.repository && github.event.repository.private) || (!github.event.repository && inputs.private)';

const installSteps = [
  { name: 'Checkout', with: { 'fetch-depth': 0, filter: 'blob:none' } },
  { name: 'Setup Node' },
  { name: 'Setup Bun' },
  { name: 'Cache bun install' },
  { name: 'Install' },
  { name: 'Pick the check scripts' },
  { name: 'Setup shfmt' },
  { name: 'Setup actionlint' },
];

test('it runs a public repo as separate gitleaks, static, test and lane jobs', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const publicProfile = `\${{ !(${privateProfile}) }}`;
  const scriptSteps = [...installSteps, { name: 'Run the check scripts' }];

  expect(workflow).toMatchObject({
    jobs: {
      gitleaks: {
        if: `\${{ inputs.gitleaks && !(${privateProfile}) }}`,
        steps: [{ name: 'Checkout' }, { name: 'Gitleaks' }],
      },
      plan: { if: publicProfile },
      static: { if: publicProfile, env: { PART: 'static' }, steps: scriptSteps },
      test: { if: publicProfile, env: { PART: 'test' }, steps: scriptSteps },
      'test-lane': {
        name: `test-\${{ matrix.lane }}`,
        needs: 'plan',
        if: `\${{ !(${privateProfile}) && needs.plan.outputs.lanes != '[]' }}`,
        env: { PART: 'lane' },
        steps: scriptSteps,
      },
    },
  });
});

test('it runs a private repo as one checks job with the scan, the static checks, the tests and each lane as steps', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const [checkout, ...setup] = installSteps;

  expect(workflow).toMatchObject({
    jobs: {
      checks: {
        if: `\${{ ${privateProfile} }}`,
        env: { PART: 'all' },
        steps: [
          checkout,
          { name: 'Gitleaks', if: 'inputs.gitleaks' },
          ...setup,
          { name: 'Static checks', env: { SCRIPTS: `\${{ steps.pick.outputs.static }}` } },
          { name: 'Tests', env: { SCRIPTS: `\${{ steps.pick.outputs.test }}` } },
          { name: 'Lane e2e', if: `contains(steps.pick.outputs.lanes, '"e2e"')` },
          { name: 'Lane browser', if: `contains(steps.pick.outputs.lanes, '"browser"')` },
          { name: 'Lane docker', if: `contains(steps.pick.outputs.lanes, '"docker"')` },
          { name: 'Lane host', if: `contains(steps.pick.outputs.lanes, '"host"')` },
        ],
      },
    },
  });
});

test('it sorts the listed scripts into static checks, tests and lanes', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        lint: 'true',
        test: 'true',
        'test:e2e': 'true',
        'test:slow': 'true',
        check: 'true',
      },
    }),
  );

  await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: 'lint test:e2e test test:slow check',
      PART: 'all',
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(output).toBe(
    [
      'scripts= lint check test test:slow test:e2e ',
      'static= lint check ',
      'test= test test:slow ',
      'lanes=["e2e"]',
      '',
    ].join('\n'),
  );
});

test('it adds each lane script the repo defines to the standard list', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        audit: 'true',
        deadcode: 'true',
        'format:check': 'true',
        lint: 'true',
        typecheck: 'true',
        test: 'true',
        'test:host': 'true',
        'test:browser': 'true',
      },
    }),
  );

  await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.directory)
    .env({ PATH: ctx.path, SCRIPTS: '', PART: 'all', GITHUB_OUTPUT: join(ctx.directory, 'output') })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(output).toInclude('lanes=["browser","host"]\n');
});

test.each([
  ['static', '', 'scripts= lint check '],
  ['test', '', 'scripts= test test:slow '],
  ['lane', 'e2e', 'scripts= test:e2e '],
])('it gives a public %s job only its own scripts', async (part, lane, expected) => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        lint: 'true',
        test: 'true',
        'test:e2e': 'true',
        'test:slow': 'true',
        check: 'true',
      },
    }),
  );

  await $`bash -c ${ctx.pick.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      SCRIPTS: 'lint test:e2e test test:slow check',
      PART: part,
      LANE: lane,
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(output.split('\n')[0]).toBe(expected);
});
