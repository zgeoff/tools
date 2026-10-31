import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createGitCommit } from '../../../test-utils/create-git-commit.ts';
import { readGitEnv } from '../../../test-utils/read-git-env.ts';
import { runProgram } from './run-program.ts';
import { runWorkflowsCheck } from './run-workflows-check.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-workflows-check-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);

  await $`git init --quiet`.cwd(directory).env(env);

  const commitFiles = (files: Readonly<Record<string, string>>): Promise<string> =>
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
      '          bun run lint "$TARGET" 2>&1 &>lint.log >&2 \'a;b|c\' "d && e" "$(date \'+%F; %T\')" "$(( (1 | 2) && 3 ))"',
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
  [String.raw`bun run lint \>& bun run test`, 'chains commands with `&`'],
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
        'a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel',
    },
    {
      path: '.github/workflows/main.yml',
      line: 3,
      message: 'the concurrency group holds github.sha, so no newer run cancels this one',
    },
  ]);
});

test('it passes a checks workflow whose every job sets its own cancelling group', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on:',
      '  pull_request:',
      'jobs:',
      '  lint:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    concurrency:',
      `      group: lint-\${{ github.ref }}`,
      '      cancel-in-progress: true',
      '    steps:',
      '      - run: bun run lint',
      '  types:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    concurrency:',
      `      group: types-\${{ github.ref }}`,
      '      cancel-in-progress: true',
      '    steps:',
      '      - run: bun run typecheck',
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
  [`checks-github.sha-\${{ github.ref }}`, []],
  [`checks-\${{ github.sha_label }}`, []],
  [`\${{ format('{0} github.sha', github.ref) }}`, []],
  [`\${{ format('it''s github.run_id {0}', github.ref) }}`, []],
  [`\${{ format('{0}}}', github.ref) }}-\${{ github.sha }}`, ['github.sha']],
  [`checks-\${{ github.sha }}`, ['github.sha']],
  [`checks-\${{ github['sha'] }}`, ['github.sha']],
  [`checks-\${{ github[ 'run_id' ] }}`, ['github.run_id']],
  [`checks-\${{ github.run_attempt }}`, ['github.run_attempt']],
])('it reads the concurrency group %p as holding the per-run values %p', async (group, values) => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on:',
      '  pull_request:',
      'concurrency:',
      `  group: "${group}"`,
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

  expect(findings).toStrictEqual(
    values.map((value) => ({
      path: '.github/workflows/checks.yml',
      line: 3,
      message: `the concurrency group holds ${value}, so no newer run cancels this one`,
    })),
  );
});

test.each([
  [
    'passes a gate on main that groups by commit sha and sets cancel-in-progress: false',
    ['  push:', '    branches: [main]'],
    'false',
    [],
  ],
  [
    'passes a gate on main that groups by commit sha and leaves cancel-in-progress out',
    ['  push:', '    branches: [main]'],
    undefined,
    [],
  ],
  [
    'reports a gate on main that groups by commit sha and cancels',
    ['  push:', '    branches: [main]'],
    'true',
    [
      {
        line: 4,
        message: 'the concurrency group holds github.sha, so no newer run cancels this one',
      },
    ],
  ],
  [
    'reports a commit sha group on a push to every branch',
    ['  push:'],
    'false',
    [
      {
        line: 1,
        message:
          'a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel',
      },
      {
        line: 3,
        message: 'the concurrency group holds github.sha, so no newer run cancels this one',
      },
    ],
  ],
  [
    'reports a commit sha group on a push to main and a release branch',
    ['  push:', "    branches: [main, 'release/**']"],
    'false',
    [
      {
        line: 1,
        message:
          'a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel',
      },
      {
        line: 4,
        message: 'the concurrency group holds github.sha, so no newer run cancels this one',
      },
    ],
  ],
  [
    'reports a commit sha group in a workflow that runs on pull requests too',
    ['  pull_request:', '  push:', '    branches: [main]'],
    'false',
    [
      {
        line: 1,
        message:
          'a checks workflow, which runs on pull_request or push, sets concurrency with cancel-in-progress: true; a gate that runs only on a push to main may instead group by github.sha and never cancel',
      },
      {
        line: 5,
        message: 'the concurrency group holds github.sha, so no newer run cancels this one',
      },
    ],
  ],
])('it %s', async (_name, triggers, cancel, expected) => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/gate.yml': [
      'on:',
      ...triggers,
      'concurrency:',
      `  group: gate-\${{ github.sha }}`,
      ...(cancel === undefined ? [] : [`  cancel-in-progress: ${cancel}`]),
      'jobs:',
      '  gate:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: bun run check',
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

  expect(findings).toStrictEqual(
    expected.map((finding) => ({ path: '.github/workflows/gate.yml', ...finding })),
  );
});

test('it passes a gate on main whose every job groups by commit sha', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/gate.yml': [
      'on:',
      '  push:',
      '    branches: [main]',
      'jobs:',
      '  gate:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    concurrency:',
      `      group: gate-\${{ github.sha }}`,
      '      cancel-in-progress: false',
      '    steps:',
      '      - run: bun run check',
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

test('it counts a KVM setup command only where the shell runs it', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/checks.yml': [
      'on: [pull_request_target]',
      'jobs:',
      '  mention:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: echo scripts/ci/check-kvm.sh',
      '      - run: bun run --silent lint ci:open-kvm',
      '      - run: bash -s scripts/open-kvm.sh',
      '      - run: bun run --cwd ci:open-kvm lint',
      '      - run: echo "$(scripts/ci/check-kvm.sh)"',
      '      - run: bash -o pipefail scripts/release.sh scripts/open-kvm.sh',
      '  shell:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 5',
      '    steps:',
      '      - run: QEMU="1" bash scripts/open-kvm.sh',
      '  command-string:',
      '    runs-on: ubuntu-24.04',
      '    timeout-minutes: 5',
      '    steps:',
      "      - run: sh -ec 'scripts/ci/check-kvm.sh --strict'",
      '',
    ].join('\n'),
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: 'private',
    runProgram,
  });

  expect(findings).toStrictEqual([
    {
      path: '.github/workflows/checks.yml',
      line: 13,
      message:
        'job shell is a heavy check, because it enables KVM through scripts/open-kvm.sh, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
    },
    {
      path: '.github/workflows/checks.yml',
      line: 18,
      message:
        'job command-string is a heavy check, because it enables KVM through scripts/ci/check-kvm.sh, in a workflow that runs on pull_request_target; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
    },
  ]);
});

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

test.each([
  ['~/.bun/install/cache', '~/.bun/install/cache'],
  ['node_modules', 'node_modules'],
  ['/nix/store\n**/node_modules/\n', '**/node_modules/'],
  ['/nix/store', undefined],
  ['node_modules_backup\n.bun/install/cache-old', undefined],
  ['/nix/store\n!node_modules', undefined],
  [`\${{ inputs.cache-root }}/node_modules`, undefined],
  [`\${{ inputs.cache-root }}\nnode_modules`, 'node_modules'],
])(
  'it reads an actions/cache step in a Bun job with the path %p as caching %p',
  async (path, cached) => {
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
        '      - name: Restore the cache',
        '        uses: actions/cache/restore@v4',
        '        with:',
        `          path: ${JSON.stringify(path)}`,
        '          key: tidy',
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

    const expected =
      cached === undefined
        ? []
        : [
            {
              path: '.github/workflows/tidy.yml',
              line: 3,
              message: `job tidy, step "Restore the cache": a Bun job caches ${cached} with actions/cache/restore@v4; bun install --frozen-lockfile runs faster than the cache restore`,
            },
          ];

    expect(findings).toStrictEqual(expected);
  },
);

test('it reports a full-history checkout that states no filter', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/scan.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  scan:',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 5',
      '    steps:',
      '      - name: Clone every commit',
      '        uses: actions/checkout@v7',
      '        with:',
      '          fetch-depth: 0',
      '      - name: Clone every commit without the contents',
      '        uses: actions/checkout@v7',
      '        with:',
      '          fetch-depth: 0',
      '          filter: blob:none',
      '      - name: Clone every commit with the contents',
      '        uses: actions/checkout@v7',
      '        with:',
      "          fetch-depth: '0'",
      "          filter: ''",
      '      - name: Clone the merge and its parents',
      '        uses: actions/checkout@v7',
      '        with:',
      '          fetch-depth: 2',
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
      path: '.github/workflows/scan.yml',
      line: 3,
      message:
        'job scan, step "Clone every commit": a checkout with fetch-depth: 0 sets filter: blob:none to clone the history without the file contents, or filter: \'\' when the job reads many old files',
    },
  ]);
});

test('it reads the workflows and the workflow callers, and skips a subfolder', async () => {
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

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: [],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
    { path: '.github/workflows/tidy.yml', line: 3, message: 'job tidy sets no timeout-minutes' },
    {
      path: 'sync/workflow-callers/tidy.yaml',
      line: 3,
      message: 'job tidy sets no timeout-minutes',
    },
  ]);
});

test('it reads only the workflow files among the paths it is given', async () => {
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
    '.github/workflows/tidy.yml': brokenJob,
  });

  const findings = runWorkflowsCheck({
    cwd: ctx.directory,
    env: ctx.env,
    paths: ['sync/workflow-callers/tidy.yaml', 'src/index.ts'],
    profile: undefined,
    runProgram,
  });

  expect(findings).toStrictEqual([
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

test('it escapes the characters a workflow command reads as syntax in its file and message', async () => {
  const ctx = await setupTest();

  await ctx.commitFiles({
    '.github/workflows/tidy,daily%1:a.yml': [
      'on: workflow_dispatch',
      'jobs:',
      '  tidy%1:',
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

  expect(result.stdout.toString().split('\n')[0]).toBe(
    '::warning file=.github/workflows/tidy%2Cdaily%251%3Aa.yml,line=3::job tidy%251 sets no timeout-minutes',
  );
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
      'usage: chex workflows [path...]',
      '',
    ].join('\n'),
  });
});

test('it reports the git error and exits 2 when HEAD has no commit', async () => {
  const ctx = await setupTest();

  const result = await $`bun ${join(import.meta.dir, 'run-workflows-check.ts')}`
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
    stderr:
      'workflows: git ls-tree -r -z --name-only HEAD failed: fatal: Not a valid object name HEAD\n',
  });
});

test.each([
  [
    'private',
    [
      '.github/workflows/checks.yml:6: job macos is a heavy check, because it runs on macos-latest, in a workflow that runs on pull_request; a private repo runs a heavy check nightly or on dispatch, never on each pull request',
      'workflows: 1 warning; the workflow lint warns and does not fail yet',
      '',
    ].join('\n'),
  ],
  ['public', ''],
])(
  'it reads the profile from CHECKS_PROFILE=%s when run as a script on the paths it is given',
  async (profile, stdout) => {
    const ctx = await setupTest();

    await ctx.commitFiles({
      '.github/workflows/checks.yml': [
        'on: [pull_request]',
        'concurrency:',
        `  group: checks-\${{ github.ref }}`,
        '  cancel-in-progress: true',
        'jobs:',
        '  macos:',
        '    runs-on: macos-latest',
        '    timeout-minutes: 5',
        '    steps:',
        '      - run: bun run test:host',
        '',
      ].join('\n'),
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

    const result =
      await $`bun ${join(import.meta.dir, 'run-workflows-check.ts')} .github/workflows/checks.yml`
        .cwd(ctx.directory)
        .env({ ...ctx.env, CHECKS_PROFILE: profile, GITHUB_ACTIONS: '' })
        .nothrow()
        .quiet();

    expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
      exitCode: 0,
      stdout,
    });
  },
);
