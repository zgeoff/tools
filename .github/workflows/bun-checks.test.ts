import { expect, onTestFinished, test } from 'bun:test';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubBun } from './create-stub-bun.ts';
import { createStubCurl } from './create-stub-curl.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';

// The checks job's steps, the planner where the fetch step puts it, and a PATH whose bun stand-in
// records each script, so each step runs for real without the scripts. The plan step runs the real
// bun. A test that downloads puts its own curl stand-in in bin.
async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'bun-checks-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const workflow = join(import.meta.dir, 'bun-checks.yml');
  const bin = join(directory, 'bin');

  await mkdir(bin);
  await createStubBun(bin, join(directory, 'ran'));
  await mkdir(join(directory, 'check-plan'));

  for (const file of ['plan-check-scripts.ts', 'write-check-plan.ts']) {
    await cp(join(import.meta.dir, file), join(directory, 'check-plan', file));
  }

  // The install step's node_modules, from this repo's install.
  await symlink(
    join(import.meta.dir, '../../node_modules'),
    join(directory, 'check-plan/node_modules'),
  );

  const plan = await loadWorkflowStep(workflow, 'static', 'Plan the check scripts');
  const setupShfmt = await loadWorkflowStep(workflow, 'static', 'Setup shfmt');
  const setupActionlint = await loadWorkflowStep(workflow, 'static', 'Setup actionlint');
  const run = await loadWorkflowStep(workflow, 'static', 'Run the check scripts');

  return {
    directory,
    bin,
    plan,
    setupShfmt,
    setupActionlint,
    run,
    path: `${bin}:${process.env['PATH']}`,
  };
}

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

  await $`bash -c ${ctx.plan.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: inputs[ctx.plan.env['SCRIPTS'] ?? ''],
      PART: 'static',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'sorted'),
    })
    .quiet();

  const sorted = await readFile(join(ctx.directory, 'sorted'), 'utf8');

  const outputs: Record<string, string> = {
    ...inputs,
    [`\${{ steps.${ctx.plan.id}.outputs.scripts }}`]:
      /^scripts=(?<list>.*)$/mu.exec(sorted)?.groups?.['list'] ?? '',
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

  await $`bash -c ${ctx.plan.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: '',
      PART: 'static',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'sorted'),
    })
    .quiet();

  const sorted = await readFile(join(ctx.directory, 'sorted'), 'utf8');

  const outputs: Record<string, string> = {
    [`\${{ steps.${ctx.plan.id}.outputs.scripts }}`]:
      /^scripts=(?<list>.*)$/mu.exec(sorted)?.groups?.['list'] ?? '',
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

test('it installs actionlint for a test job when the caller sets the setup-actionlint input', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'release'));
  await writeFile(join(ctx.directory, 'release/actionlint'), 'fake actionlint\n', { mode: 0o755 });

  await $`tar -czf ${join(ctx.directory, 'release.tar.gz')} -C ${join(ctx.directory, 'release')} actionlint`.quiet();

  const archive = await readFile(join(ctx.directory, 'release.tar.gz'));

  await createStubCurl(ctx.bin, archive);

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { test: 'true' } }),
  );

  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  // The caller's inputs, under the expression each step uses to read them.
  const inputs: Record<string, string> = {
    [`\${{ inputs.scripts }}`]: 'test',
    [`\${{ inputs.setup-actionlint }}`]: 'true',
  };

  await $`bash -c ${ctx.plan.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: inputs[ctx.plan.env['SCRIPTS'] ?? ''],
      PART: 'test',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'planned'),
    })
    .quiet();

  const planned = await readFile(join(ctx.directory, 'planned'), 'utf8');

  const outputs: Record<string, string> = {
    ...inputs,
    [`\${{ steps.${ctx.plan.id}.outputs.scripts }}`]:
      /^scripts=(?<list>.*)$/mu.exec(planned)?.groups?.['list'] ?? '',
  };

  await $`bash -c ${ctx.setupActionlint.run}`
    .cwd(ctx.directory)
    .env({
      ...ctx.setupActionlint.env,
      PATH: ctx.path,
      SCRIPTS: outputs[ctx.setupActionlint.env['SCRIPTS'] ?? ''],
      SETUP_ACTIONLINT: outputs[ctx.setupActionlint.env['SETUP_ACTIONLINT'] ?? ''],
      ACTIONLINT_SHA256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
      RUNNER_TEMP: ctx.directory,
      GITHUB_PATH: join(ctx.directory, 'github-path'),
    })
    .quiet();

  const installed = await Bun.file(join(ctx.directory, 'actionlint-bin/actionlint')).exists();

  expect(workflow).toMatchObject({
    on: {
      workflow_call: {
        inputs: { 'setup-actionlint': { type: 'boolean', required: false, default: false } },
      },
    },
  });

  expect(outputs[ctx.setupActionlint.env['SCRIPTS'] ?? '']).toBe(' test ');
  expect(installed).toBeTrue();
});

test('it downloads the planner files and the catalog from the commit that defines the job', async () => {
  const ctx = await setupTest();

  const fetch = await loadWorkflowStep(
    join(import.meta.dir, 'bun-checks.yml'),
    'static',
    'Fetch the check planner',
  );

  const runnerTemp = join(ctx.directory, 'runner');

  await createStubCurl(ctx.bin, '// planner\n');

  await $`bash -c ${fetch.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      JOB_CONTEXT: '{"workflow_repository":"acme/tools","workflow_sha":"abc123"}',
      RUNNER_TEMP: runnerTemp,
    })
    .quiet();

  const urls = await readFile(join(ctx.bin, 'curl.urls'), 'utf8');
  const files = await readdir(join(runnerTemp, 'check-plan'));

  expect(fetch.env).toStrictEqual({ JOB_CONTEXT: `\${{ toJSON(job) }}` });

  expect(urls).toBe(
    [
      'https://raw.githubusercontent.com/acme/tools/abc123/.github/workflows/plan-check-scripts.ts',
      'https://raw.githubusercontent.com/acme/tools/abc123/.github/workflows/write-check-plan.ts',
      'https://raw.githubusercontent.com/acme/tools/abc123/package.json',
      '',
    ].join('\n'),
  );

  expect(files.toSorted()).toStrictEqual([
    'plan-check-scripts.ts',
    'tools-package.json',
    'write-check-plan.ts',
  ]);
});

test('it fails the fetch and downloads nothing when the job context lacks the commit', async () => {
  const ctx = await setupTest();

  const fetch = await loadWorkflowStep(
    join(import.meta.dir, 'bun-checks.yml'),
    'static',
    'Fetch the check planner',
  );

  await createStubCurl(ctx.bin, '// planner\n');

  const result = await $`bash -c ${fetch.run}`
    .cwd(ctx.directory)
    .env({
      PATH: ctx.path,
      JOB_CONTEXT: '{"workflow_repository":"acme/tools"}',
      RUNNER_TEMP: join(ctx.directory, 'runner'),
    })
    .nothrow()
    .quiet();

  const downloaded = await Bun.file(join(ctx.bin, 'curl.urls')).exists();

  expect({ exitCode: result.exitCode, downloaded }).toStrictEqual({
    exitCode: 1,
    downloaded: false,
  });
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

test('it installs without a cache step, because a restore of the install cache takes longer than the install', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  const cache: unknown = expect.objectContaining({
    uses: expect.stringMatching(/^actions\/cache@/u),
  });

  const job: unknown = expect.objectContaining({
    steps: expect.not.arrayContaining([cache]),
  });

  expect(workflow).toMatchObject({
    jobs: { static: job, test: job, 'test-lane': job, checks: job },
  });
});

test('it runs a public repo as separate gitleaks, static, test and lane jobs', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const publicProfile = `\${{ !((github.event.repository && github.event.repository.private) || (!github.event.repository && inputs.private)) }}`;

  const steps = [
    { name: 'Checkout', with: { 'fetch-depth': 0, filter: 'blob:none' } },
    { name: 'Setup Node' },
    { name: 'Setup Bun' },
    { name: 'Install' },
    { name: 'Fetch the check planner' },
    { name: 'Install the check planner' },
    { name: 'Plan the check scripts' },
    { name: 'Setup shfmt' },
    { name: 'Setup actionlint' },
    { name: 'Run the check scripts' },
  ];

  expect(workflow).toMatchObject({
    jobs: {
      gitleaks: {
        if: `\${{ inputs.gitleaks && !((github.event.repository && github.event.repository.private) || (!github.event.repository && inputs.private)) }}`,
        steps: [{ name: 'Checkout' }, { name: 'Gitleaks' }],
      },
      plan: { if: publicProfile },
      static: { if: publicProfile, env: { PART: 'static' }, steps },
      test: { if: publicProfile, env: { PART: 'test' }, steps },
      'test-lane': {
        name: `test-\${{ matrix.lane }}`,
        needs: 'plan',
        if: `\${{ !((github.event.repository && github.event.repository.private) || (!github.event.repository && inputs.private)) && needs.plan.outputs.lanes != '[]' }}`,
        env: { PART: 'lane' },
        steps,
      },
    },
  });
});

test('it runs a private repo as one checks job with the scan, the static checks, the tests and each lane as steps', async () => {
  const text = await readFile(join(import.meta.dir, 'bun-checks.yml'), 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  expect(workflow).toMatchObject({
    jobs: {
      checks: {
        if: `\${{ (github.event.repository && github.event.repository.private) || (!github.event.repository && inputs.private) }}`,
        env: { PART: 'all' },
        steps: [
          { name: 'Checkout', with: { 'fetch-depth': 0, filter: 'blob:none' } },
          { name: 'Gitleaks', if: 'inputs.gitleaks' },
          { name: 'Setup Node' },
          { name: 'Setup Bun' },
          { name: 'Install' },
          { name: 'Fetch the check planner' },
          { name: 'Install the check planner' },
          { name: 'Plan the check scripts' },
          { name: 'Setup shfmt' },
          { name: 'Setup actionlint' },
          { name: 'Static checks', env: { SCRIPTS: `\${{ steps.plan.outputs.static }}` } },
          { name: 'Tests', env: { SCRIPTS: `\${{ steps.plan.outputs.test }}` } },
          { name: 'Lane e2e', if: `contains(steps.plan.outputs.lanes, '"e2e"')` },
          { name: 'Lane browser', if: `contains(steps.plan.outputs.lanes, '"browser"')` },
          { name: 'Lane docker', if: `contains(steps.plan.outputs.lanes, '"docker"')` },
          { name: 'Lane host', if: `contains(steps.plan.outputs.lanes, '"host"')` },
        ],
      },
    },
  });
});

test('it runs the static checks, the tests and each lane once through the private job bindings', async () => {
  const ctx = await setupTest();

  const workflow = join(import.meta.dir, 'bun-checks.yml');

  const plan = await loadWorkflowStep(workflow, 'checks', 'Plan the check scripts');
  const staticChecks = await loadWorkflowStep(workflow, 'checks', 'Static checks');
  const tests = await loadWorkflowStep(workflow, 'checks', 'Tests');

  const lanes = [
    await loadWorkflowStep(workflow, 'checks', 'Lane e2e'),
    await loadWorkflowStep(workflow, 'checks', 'Lane browser'),
    await loadWorkflowStep(workflow, 'checks', 'Lane docker'),
    await loadWorkflowStep(workflow, 'checks', 'Lane host'),
  ];

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: {
        lint: 'true',
        test: 'true',
        'test:e2e': 'true',
        'test:browser': 'true',
        'test:docker': 'true',
        'test:host': 'true',
      },
    }),
  );

  await $`bash -c ${plan.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: 'lint test test:e2e test:browser test:docker test:host',
      PART: 'all',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'sorted'),
    })
    .quiet();

  const sorted = await readFile(join(ctx.directory, 'sorted'), 'utf8');

  const outputs: Record<string, string> = {
    [`\${{ steps.${plan.id}.outputs.static }}`]:
      /^static=(?<list>.*)$/mu.exec(sorted)?.groups?.['list'] ?? '',
    [`\${{ steps.${plan.id}.outputs.test }}`]:
      /^test=(?<list>.*)$/mu.exec(sorted)?.groups?.['list'] ?? '',
  };

  for (const step of [staticChecks, tests]) {
    await $`bash -c ${step.run}`
      .cwd(ctx.directory)
      .env({ PATH: ctx.path, SCRIPTS: outputs[step.env['SCRIPTS'] ?? ''] })
      .quiet();
  }

  for (const lane of lanes) {
    await $`bash -c ${lane.run}`
      .cwd(ctx.directory)
      .env({ PATH: ctx.path, SCRIPTS: lane.env['SCRIPTS'] })
      .quiet();
  }

  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(sorted).toInclude('lanes=["e2e","browser","docker","host"]\n');
  expect(ran).toBe('lint\ntest\ntest:e2e\ntest:browser\ntest:docker\ntest:host\n');
});

test('it starts one public lane job per selected lane, each running its own script', async () => {
  const ctx = await setupTest();

  const workflowPath = join(import.meta.dir, 'bun-checks.yml');

  const text = await readFile(workflowPath, 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);

  const planStep = await loadWorkflowStep(workflowPath, 'plan', 'Plan the check scripts');
  const lanePlan = await loadWorkflowStep(workflowPath, 'test-lane', 'Plan the check scripts');
  const laneRun = await loadWorkflowStep(workflowPath, 'test-lane', 'Run the check scripts');

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({
      scripts: { lint: 'true', test: 'true', 'test:e2e': 'true', 'test:host': 'true' },
    }),
  );

  expect(workflow).toMatchObject({
    jobs: {
      plan: {
        env: { PART: 'all' },
        outputs: { lanes: `\${{ steps.${planStep.id}.outputs.lanes }}` },
      },
      'test-lane': {
        strategy: { matrix: { lane: `\${{ fromJSON(needs.plan.outputs.lanes) }}` } },
        env: { PART: 'lane', LANE: `\${{ matrix.lane }}` },
      },
    },
  });

  await $`bash -c ${planStep.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: 'lint test test:e2e test:host',
      PART: 'all',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'planned'),
    })
    .quiet();

  const planned = await readFile(join(ctx.directory, 'planned'), 'utf8');

  const lanes = /^lanes=(?<list>.*)$/mu.exec(planned)?.groups?.['list'] ?? '';

  const listed = await $`echo ${lanes} | jq -r '.[]'`.text();

  const matrix = listed.trim().split('\n');

  for (const lane of matrix) {
    const sorted = join(ctx.directory, `sorted-${lane}`);

    await $`bash -c ${lanePlan.run}`
      .cwd(ctx.directory)
      .env({
        PATH: process.env['PATH'],
        SCRIPTS: 'lint test test:e2e test:host',
        PART: 'lane',
        RUNNER_TEMP: ctx.directory,
        LANE: lane,
        GITHUB_OUTPUT: sorted,
      })
      .quiet();

    const sortedText = await readFile(sorted, 'utf8');

    const scripts = /^scripts=(?<list>.*)$/mu.exec(sortedText)?.groups?.['list'] ?? '';

    await $`bash -c ${laneRun.run}`
      .cwd(ctx.directory)
      .env({ PATH: ctx.path, SCRIPTS: scripts })
      .quiet();
  }

  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(matrix).toStrictEqual(['e2e', 'host']);
  expect(ran).toBe('test:e2e\ntest:host\n');
});

test('it plans no lanes for a repo without lane scripts, so no public lane job starts', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'true', test: 'true' } }),
  );

  await $`bash -c ${ctx.plan.run}`
    .cwd(ctx.directory)
    .env({
      PATH: process.env['PATH'],
      SCRIPTS: 'lint test',
      PART: 'all',
      RUNNER_TEMP: ctx.directory,
      GITHUB_OUTPUT: join(ctx.directory, 'output'),
    })
    .quiet();

  const output = await readFile(join(ctx.directory, 'output'), 'utf8');

  expect(output).toBe(
    ['scripts= lint test ', 'static= lint ', 'test= test ', 'lanes=[]', ''].join('\n'),
  );
});
