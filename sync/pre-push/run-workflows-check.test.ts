import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createGitCommit } from '../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../test-utils/read-git-env.ts';
import { runProgram } from './run-program.ts';
import { runWorkflowsCheck } from './run-workflows-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-workflows-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet`.cwd(directory).env(env);

  const commitFiles = (files: Readonly<Record<string, string>>): Promise<void> =>
    createGitCommit(directory, env, files);

  return { directory, env, commitFiles };
}

test('it passes workflows that follow every rule', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on:',
      '  pull_request:',
      '  push:',
      '    branches: [main]',
      'concurrency:',
      `  group: checks-\${{ github.ref }}`,
      '  cancel-in-progress: true',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 10',
      '    steps:',
      '      - uses: oven-sh/setup-bun@v2',
      '      - run: bun install --frozen-lockfile',
      '      - name: Lint',
      '        env:',
      `          TARGET: \${{ github.base_ref }}`,
      '        run: |',
      '          bun run lint "$TARGET" 2>&1 &>lint.log >&2 \'a;b|c\' "d && e" "$(date \'+%F; %T\')"',
      '  shared:',
      '    uses: ./.github/workflows/shared.yml',
      '',
    ].join('\n'),
    '.github/workflows/nightly.yml': [
      'on:',
      '  schedule:',
      "    - cron: '0 3 * * *'",
      '  workflow_run:',
      '    workflows: [Checks]',
      '    branches: [main]',
      'jobs:',
      '  macos:',
      '    runs-on: macos-latest',
      '    timeout-minutes: 30',
      '    steps:',
      '      - uses: actions/cache@v4',
      '      - run: bun run test:host',
      '  deploy:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 15',
      '    concurrency:',
      '      group: deploy-production',
      '      cancel-in-progress: false',
      '    steps:',
      '      - run: bun run deploy',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([]);
});

test.each([
  ['echo one\necho two', 'spans more than one line'],
  [`bun run lint \${{ inputs.target }}`, `holds a \${{ }} expression, which belongs in env`],
  ['bun install && bun run lint', 'chains commands with `&&`'],
  ['bun run lint || true', 'chains commands with `||`'],
  ['bun run lint & bun run test', 'chains commands with `&`'],
  ['cd packages; bun run lint', 'chains commands with `;`'],
  ['bun run lint | tee lint.log', 'chains commands with `|`'],
  ['echo "$(bun install && bun run lint)"', 'chains commands with `&&`'],
  ['echo "`git log | head`"', 'chains commands with `|`'],
  ['if true', 'starts with the shell keyword `if`'],
  ['for name in a', 'starts with the shell keyword `for`'],
  ['while true', 'starts with the shell keyword `while`'],
  ['case "$NAME" in', 'starts with the shell keyword `case`'],
])('it reports the run %p, which %s', async (run, fault) => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - name: Tidy',
      `        run: ${JSON.stringify(run)}`,
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/tidy.yml',
      line: 3,
      message: `job tidy, step "Tidy": the run ${fault}; a run holds one command on one line, and anything more goes in a script`,
    },
  ]);
});

test('it reports a job without timeout-minutes, and passes a job that calls a reusable workflow', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  shared:',
      '    uses: ./.github/workflows/shared.yml',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: bun run tidy',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    { path: '.github/workflows/tidy.yml', line: 5, message: 'job tidy sets no timeout-minutes' },
  ]);
});

test('it reports a checks workflow that never cancels, and a group that holds a per-run value', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on:',
      '  pull_request:',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run lint',
      '',
    ].join('\n'),
    '.github/workflows/main.yml': [
      'on:',
      '  push:',
      'concurrency:',
      `  group: main-\${{ github.sha }}`,
      '  cancel-in-progress: true',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run lint',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/checks.yml',
      line: 1,
      message:
        'a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true',
    },
    {
      path: '.github/workflows/main.yml',
      line: 3,
      message: 'the concurrency group holds github.sha, so no newer run cancels this one',
    },
  ]);
});

test('it reports a release or deploy job that a newer run can cancel', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/main.yml': [
      'on:',
      '  push:',
      'concurrency:',
      '  group: main',
      '  cancel-in-progress: true',
      'jobs:',
      '  checks:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run lint',
      '  ship:',
      '    name: Release packages',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run release',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/main.yml',
      line: 12,
      message:
        'job ship releases or deploys, so it sets a job-level concurrency group with cancel-in-progress: false',
    },
    {
      path: '.github/workflows/main.yml',
      line: 3,
      message:
        'the workflow-level cancel-in-progress: true can cancel job ship, which releases or deploys; set each concurrency group per job',
    },
    {
      path: '.github/workflows/main.yml',
      line: 7,
      message:
        'job checks runs in a checks workflow beside a release or deploy job, so it sets a job-level concurrency group with cancel-in-progress: true',
    },
  ]);
});

test('it reports a workflow_run trigger without a branches filter', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/audit.yml': [
      'on:',
      '  workflow_run:',
      '    workflows: [Checks]',
      '    types: [completed]',
      'jobs:',
      '  audit:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run audit',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/audit.yml',
      line: 1,
      message:
        'the workflow_run trigger has no branches filter, so a run of the named workflow on any branch starts it',
    },
  ]);
});

test.each([['private' as const], [undefined]])(
  'it reports each heavy check in a pull_request workflow when the profile is %p, and leaves a runner expression alone',
  async (profile) => {
    const ctx = await setupTest();

    await ctx.commitFiles({
      '.github/workflows/checks.yml': [
        'on: [pull_request_target]',
        'jobs:',
        '  macos:',
        '    runs-on: macos-latest',
        '    timeout-minutes: 5',
        '    steps:',
        '      - run: bun run test:host',
        '  self-hosted:',
        '    runs-on: [self-hosted, linux]',
        '    timeout-minutes: 5',
        '    steps:',
        '      - run: bun run test:vm',
        '  large:',
        '    runs-on:',
        '      group: large-runners',
        '    timeout-minutes: 5',
        '    steps:',
        '      - run: bun run test:docker',
        '  vm:',
        '    runs-on: ubuntu-24.04',
        '    timeout-minutes: 5',
        '    steps:',
        '      - name: Check KVM',
        '        run: scripts/ci/check-kvm.sh',
        '      - run: bun run test:vm',
        '  matrix:',
        `    runs-on: \${{ matrix.os }}`,
        '    timeout-minutes: 5',
        '    steps:',
        '      - run: bun run test',
        '',
      ].join('\n'),
    });

    const findings = runWorkflowsCheck({
      cwd: ctx.directory,
      env: ctx.env,
      paths: [],
      profile,
      runProgram,
    });

    expect(findings).toStrictEqual([
      {
        path: '.github/workflows/checks.yml',
        line: 3,
        message:
          'job macos is a heavy check, because it runs on macos-latest, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
      },
      {
        path: '.github/workflows/checks.yml',
        line: 8,
        message:
          'job self-hosted is a heavy check, because it runs on self-hosted, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
      },
      {
        path: '.github/workflows/checks.yml',
        line: 13,
        message:
          'job large is a heavy check, because it runs on a runner group, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
      },
      {
        path: '.github/workflows/checks.yml',
        line: 19,
        message:
          'job vm is a heavy check, because it enables KVM through scripts/ci/check-kvm.sh, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
      },
    ]);
  },
);

test('it leaves a heavy check alone in a public run', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on: [pull_request_target]',
      'jobs:',
      '  macos:',
      '    runs-on: macos-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run test:host',
      '  vm:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run --silent ci:open-kvm',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: 'public',
    runProgram,
  });

  expect(findings).toStrictEqual([]);
});

test('it reports actions/cache in a Bun job', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - uses: oven-sh/setup-bun@v2',
      '      - name: Restore the install cache',
      '        uses: actions/cache/restore@v4',
      '      - run: bun install --frozen-lockfile',
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/tidy.yml',
      line: 3,
      message:
        'job tidy, step "Restore the install cache": a Bun job uses actions/cache/restore@v4; bun install --frozen-lockfile runs faster than the cache restore',
    },
  ]);
});

test('it reads the workflow callers, skips a subfolder, and reads only the paths it is given', async () => {
  const ctx = await setupTest();

  const brokenJob = [
    'on: workflow_dispatch',
    'jobs:',
    '  tidy:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: bun run tidy',
    '',
  ].join('\n');

  await ctx.commitFiles({
    'sync/workflow-callers/tidy.yaml': brokenJob,
    '.github/workflows/nested/tidy.yml': brokenJob,
    '.github/workflows/tidy.yml': brokenJob,
  });

  const everyFile = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  const askedFile = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: ['sync/workflow-callers/tidy.yaml', 'src/index.ts'],
    profile: undefined,
    runProgram,
  });

  expect(everyFile).toStrictEqual([
    { path: '.github/workflows/tidy.yml', line: 3, message: 'job tidy sets no timeout-minutes' },
    {
      path: 'sync/workflow-callers/tidy.yaml',
      line: 3,
      message: 'job tidy sets no timeout-minutes',
    },
  ]);

  expect(askedFile).toStrictEqual([
    {
      path: 'sync/workflow-callers/tidy.yaml',
      line: 3,
      message: 'job tidy sets no timeout-minutes',
    },
  ]);
});

test('it reads each workflow as HEAD holds it, not as the working tree holds it', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: bun run tidy',
      '',
    ].join('\n'),
  });

  await Bun.write(
    join(ctx.directory, '.github/workflows/tidy.yml'),
    [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run tidy',
      '',
    ].join('\n'),
  );

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    { path: '.github/workflows/tidy.yml', line: 3, message: 'job tidy sets no timeout-minutes' },
  ]);
});

test('it reports a workflow it cannot parse', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({ '.github/workflows/broken.yml': 'jobs: [unclosed\n' });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/broken.yml',
      line: 1,
      message: 'cannot parse the workflow: YAML Parse error: Unexpected token',
    },
  ]);
});

test('it prints each finding as a warning annotation in Actions, and exits 0', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: bun run tidy',
      '',
    ].join('\n'),
  });

  const result = await $`bun ${join(import.meta.dir, 'run-workflows-check.ts')}`
    .cwd(ctx.directory)
    .env({ ...ctx.env, GITHUB_ACTIONS: 'true' })
    .nothrow()
    .quiet();

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: [
      '::warning file=.github/workflows/tidy.yml,line=3::job tidy sets no timeout-minutes',
      'workflows: 1 warning; the workflow lint warns and does not fail yet',
      '',
    ].join('\n'),
  });
});

test('it refuses an option it does not know, and exits 2 before it reads a workflow', async () => {
  const ctx = await setupTest();

  const result = await $`bun ${join(import.meta.dir, 'run-workflows-check.ts')} --unknown`
    .cwd(ctx.directory)
    .env(ctx.env)
    .nothrow()
    .quiet();

  expect({
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }).toStrictEqual({
    exitCode: 2,
    stdout: '',
    stderr: [
      `workflows: Unknown option '--unknown'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--unknown"`,
      'usage: run-workflows-check.ts [path...]',
      '',
    ].join('\n'),
  });
});
