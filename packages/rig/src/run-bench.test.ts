import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { runBench } from './run-bench.ts';
import type { BenchDeps } from './run-bench.ts';
import { buildStubCommandAnswers } from './test-utils/build-stub-command-answers.ts';
import { buildStubLookup } from './test-utils/build-stub-lookup.ts';
import { makeRecordingStub } from './test-utils/make-recording-stub.ts';

function setupTest() {
  const controller = new AbortController();

  const startKiln = mock<() => Promise<unknown>>(() =>
    Promise.resolve({ environment: { KILN_URL: 'http://localhost:7001' } }),
  );

  const stopKiln = mock<() => Promise<unknown>>(() => Promise.resolve());
  const removeFolder = mock<(path: string) => Promise<void>>(() => Promise.resolve());
  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    controller,
    removeFolder,
    output,
    startKiln,
    stopKiln,
    run: {
      repoRoot: '/repo',
      environment: { PATH: '/bin' },
      signal: controller.signal,
      runID: '1',
    },
    deps: {
      dietScript: '/diet.sh',
      benchScript: '/run-bench-file.ts',
      output,
      readConfig: () => Promise.resolve(defineRig({})),
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve([
          'packages/kettle/package.json',
          'packages/kettle/bench/boil.bench.ts',
          'packages/kettle/bench/steep.bench.ts',
        ]),
      importModule: buildStubLookup<unknown>(
        {
          '/repo/test-utils/start-kiln.ts': { default: startKiln },
          '/repo/test-utils/stop-kiln.ts': { default: stopKiln },
        },
        {},
      ),
      createWorkFolder: () => Promise.resolve('/repo/.git/rig-bench/run-1'),
      readText: () => Promise.resolve(null),
      removeFolder,
    },
  };
}

test('it runs each bench file in a process of its own under diet, with the head report', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const exitCode = await runBench([], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(0);

  expect(commands.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
    [
      'bash',
      '/diet.sh',
      '--',
      'bun',
      '/run-bench-file.ts',
      '/repo/packages/kettle/bench/boil.bench.ts',
      '--report',
      '/repo/.git/rig-bench/run-1/head.jsonl',
    ],
    [
      'bash',
      '/diet.sh',
      '--',
      'bun',
      '/run-bench-file.ts',
      '/repo/packages/kettle/bench/steep.bench.ts',
      '--report',
      '/repo/.git/rig-bench/run-1/head.jsonl',
    ],
  ]);
});

test('it runs every file and exits 1 when one bench file fails', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [1, 0], outputs: {} });

  const exitCode = await runBench([], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(1);
  expect(commands.runCommand).toHaveBeenCalledTimes(2);
});

test('it exits 1 when a head entry is over its budget and no base is given', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":4,"spreadMs":0.5,"budgetMs":50}\n' +
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":4,"medianMs":61,"spreadMs":3,"budgetMs":50}\n',
    },
    null,
  );

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect(exitCode).toBe(1);
});

test('it exits 0 when every entry is within budget', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":4,"spreadMs":0.5,"budgetMs":50}\n' +
        '{"file":"/repo/packages/kettle/bench/steep.bench.ts","name":"steep","concurrency":1,"medianMs":12,"spreadMs":1,"budgetMs":20}\n',
    },
    null,
  );

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect(exitCode).toBe(0);
});

test('it exits 1 and names the line when the report holds a line that is no entry', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const readText = buildStubLookup<string | null>(
    { '/repo/.git/rig-bench/run-1/head.jsonl': 'the kettle boiled\n' },
    null,
  );

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect({ exitCode, err: ctx.output.err.mock.calls }).toStrictEqual({
    exitCode: 1,
    err: [['rig bench: the bench report holds a line that is no entry: the kettle boiled\n']],
  });
});

test('it runs only the benchmark that the name picks', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  await runBench(['steep'], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(commands.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
    [
      'bash',
      '/diet.sh',
      '--',
      'bun',
      '/run-bench-file.ts',
      '/repo/packages/kettle/bench/steep.bench.ts',
      '--report',
      '/repo/.git/rig-bench/run-1/head.jsonl',
    ],
  ]);
});

test('it exits 1 and names the benchmarks when the name matches none', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const exitCode = await runBench(['brew'], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig bench: no benchmark named "brew"; the benchmarks are boil, steep\n',
  );
});

test('it says so and exits 0 when the repo has no benchmark', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readTrackedFiles: () => Promise.resolve([]),
  });

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the repo has no benchmarks\n');
});

test('it runs the start hook of the bench lane first, hands its environment on, and runs the stop hook after', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const config = defineRig({
    lanes: {
      kiln: { limit: '15s', start: 'test-utils/start-kiln.ts', stop: 'test-utils/stop-kiln.ts' },
    },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(0);
  expect(ctx.startKiln).toHaveBeenCalledTimes(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);

  expect(commands.runCommand.mock.calls[0]?.[1].environment).toStrictEqual({
    PATH: '/bin',
    KILN_URL: 'http://localhost:7001',
  });
});

test('it runs the stop hook of the bench lane even when a benchmark fails', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [1, 1], outputs: {} });

  const config = defineRig({
    lanes: { kiln: { limit: '15s', stop: 'test-utils/stop-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);
});

test('it exits 2 and says why for more than one name', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const exitCode = await runBench(['boil', 'steep'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({ exitCode, err: ctx.output.err.mock.calls }).toStrictEqual({
    exitCode: 2,
    err: [['rig bench: takes at most one benchmark name\n']],
  });
});

test('it builds each program once in its package folder and hands its artifact path to the benchmarks', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const config = defineRig({
    programs: {
      'kettle-cli': {
        package: 'packages/kettle',
        source: 'src/cli.ts',
        build: 'bun build src/cli.ts --outfile dist/cli.js',
        artifact: 'dist/cli.js',
      },
    },
  });

  const exitCode = await runBench([], config, ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(0);

  expect(commands.runCommand.mock.calls[0]).toStrictEqual([
    ['bash', '-c', 'bun build src/cli.ts --outfile dist/cli.js'],
    { cwd: '/repo/packages/kettle', environment: { PATH: '/bin' }, signal: ctx.run.signal },
  ]);

  expect(commands.runCommand.mock.calls.slice(1).map((call) => call[1].environment)).toStrictEqual([
    { PATH: '/bin', RIG_PROGRAM_KETTLE_CLI: '/repo/packages/kettle/dist/cli.js' },
    { PATH: '/bin', RIG_PROGRAM_KETTLE_CLI: '/repo/packages/kettle/dist/cli.js' },
  ]);
});

test('it fails with the program name when a build fails, and runs no benchmark', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [3], outputs: {} });

  const config = defineRig({
    programs: {
      'kettle-cli': {
        package: 'packages/kettle',
        source: 'src/cli.ts',
        build: 'bun build src/cli.ts --outfile dist/cli.js',
        artifact: 'dist/cli.js',
      },
    },
  });

  const exitCode = await runBench([], config, ctx.run, { ...ctx.deps, ...commands });

  expect(exitCode).toBe(3);
  expect(commands.runCommand).toHaveBeenCalledTimes(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: the build of program "kettle-cli" failed with exit code 3: bun build src/cli.ts --outfile dist/cli.js\n',
  );
});

test('it checks the base out, runs the base side and then the head side, and removes the checkout', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(commands.runCommand.mock.calls.map((call) => [call[0], call[1].cwd])).toStrictEqual([
    [['git', 'worktree', 'add', '--detach', '/repo/.git/rig-bench/run-1/base', 'main'], '/repo'],
    [['bun', 'install', '--frozen-lockfile'], '/repo/.git/rig-bench/run-1/base'],
    [
      [
        'bash',
        '/diet.sh',
        '--',
        'bun',
        '/run-bench-file.ts',
        '/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts',
        '--report',
        '/repo/.git/rig-bench/run-1/base.jsonl',
      ],
      '/repo/.git/rig-bench/run-1/base',
    ],
    [
      [
        'bash',
        '/diet.sh',
        '--',
        'bun',
        '/run-bench-file.ts',
        '/repo/packages/kettle/bench/boil.bench.ts',
        '--report',
        '/repo/.git/rig-bench/run-1/head.jsonl',
      ],
      '/repo',
    ],
    [['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'], '/repo'],
  ]);
});

test('it prints the base, the head and the change of each bench and level', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/base.jsonl':
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":1,"medianMs":12.1,"spreadMs":0.8,"budgetMs":80}\n' +
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":4,"medianMs":30.4,"spreadMs":2.1,"budgetMs":80}\n',
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":1,"medianMs":11.5,"spreadMs":0.7,"budgetMs":80}\n' +
        '{"file":"/repo/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":4,"medianMs":33.2,"spreadMs":2.4,"budgetMs":80}\n',
    },
    null,
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect({ exitCode, out: ctx.output.out.mock.calls }).toStrictEqual({
    exitCode: 0,
    out: [
      [
        'bench         concurrency  base median  base spread  head median  head spread  change\n' +
          'pour one cup  1            12.10ms      0.80ms       11.50ms      0.70ms       -5.0%\n' +
          'pour one cup  4            30.40ms      2.10ms       33.20ms      2.40ms       +9.2%\n',
      ],
    ],
  });
});

test('it passes a comparison whose base entry is over its budget', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/base.jsonl':
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":70,"spreadMs":2,"budgetMs":50}\n',
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":40,"spreadMs":2,"budgetMs":50}\n',
    },
    null,
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect(exitCode).toBe(0);
});

test('it fails a comparison whose head entry is over its budget', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":70,"spreadMs":2,"budgetMs":50}\n',
    },
    null,
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect(exitCode).toBe(1);
});

test('it fails a comparison whose base side fails', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, 0, 1],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const exitCode = await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect(exitCode).toBe(1);
});

test('it compares a named benchmark that only the base has, with a dash on the head', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readTrackedFiles = buildStubLookup<readonly string[]>(
    {
      '/repo': ['packages/kettle/package.json', 'packages/kettle/bench/boil.bench.ts'],
      '/repo/.git/rig-bench/run-1/base': [
        'packages/kettle/package.json',
        'packages/kettle/bench/brew.bench.ts',
      ],
    },
    [],
  );

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/base.jsonl':
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/brew.bench.ts","name":"brew","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n',
    },
    null,
  );

  const exitCode = await runBench(['--base', 'main', 'brew'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readTrackedFiles,
    readText,
  });

  expect({ exitCode, out: ctx.output.out.mock.calls }).toStrictEqual({
    exitCode: 0,
    out: [
      [
        'bench  concurrency  base median  base spread  head median  head spread  change\n' +
          'brew   1            12.00ms      0.50ms       -            -            -\n',
      ],
    ],
  });
});

test('it exits 1, names the benchmarks of both sides and cleans up when neither side has the name', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readTrackedFiles = buildStubLookup<readonly string[]>(
    {
      '/repo': [
        'packages/kettle/package.json',
        'packages/kettle/bench/boil.bench.ts',
        'packages/kettle/bench/steep.bench.ts',
      ],
      '/repo/.git/rig-bench/run-1/base': [
        'packages/kettle/package.json',
        'packages/kettle/bench/steep.bench.ts',
        'packages/kettle/bench/pour.bench.ts',
      ],
    },
    [],
  );

  const exitCode = await runBench(['--base', 'main', 'brew'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readTrackedFiles,
  });

  expect({
    exitCode,
    err: ctx.output.err.mock.calls,
    lastCommand: commands.runCommand.mock.calls.at(-1)?.[0],
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    err: [['rig bench: no benchmark named "brew"; the benchmarks are boil, steep, pour\n']],
    lastCommand: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it compares two bench files that define a benchmark of the same name, each with its file', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/base.jsonl':
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts","name":"pour","concurrency":1,"medianMs":40,"spreadMs":2,"budgetMs":80}\n' +
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/steep.bench.ts","name":"pour","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n',
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/steep.bench.ts","name":"pour","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n' +
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"pour","concurrency":1,"medianMs":44,"spreadMs":3,"budgetMs":80}\n',
    },
    null,
  );

  await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readText,
  });

  expect(ctx.output.out.mock.calls).toStrictEqual([
    [
      'bench                                        concurrency  base median  base spread  head median  head spread  change\n' +
        'pour (packages/kettle/bench/steep.bench.ts)  1            12.00ms      0.50ms       12.00ms      0.50ms       +0.0%\n' +
        'pour (packages/kettle/bench/boil.bench.ts)   1            40.00ms      2.00ms       44.00ms      3.00ms       +10.0%\n',
    ],
  ]);
});

test('it runs the base side from the package folder of the checkout when rig starts in a package folder', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: 'packages/kettle/\n' } },
  });

  const readConfig = mock<BenchDeps['readConfig']>(() => Promise.resolve(defineRig({})));

  const readTrackedFiles = buildStubLookup<readonly string[]>(
    {
      '/repo/packages/kettle': ['package.json', 'bench/boil.bench.ts'],
      '/repo/.git/rig-bench/run-1/base/packages/kettle': ['package.json', 'bench/boil.bench.ts'],
    },
    [],
  );

  const readText = buildStubLookup<string | null>(
    {
      '/repo/.git/rig-bench/run-1/base.jsonl':
        '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":40,"spreadMs":2,"budgetMs":80}\n',
      '/repo/.git/rig-bench/run-1/head.jsonl':
        '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":44,"spreadMs":3,"budgetMs":80}\n',
    },
    null,
  );

  const exitCode = await runBench(
    ['--base', 'main'],
    defineRig({}),
    { ...ctx.run, repoRoot: '/repo/packages/kettle' },
    {
      ...ctx.deps,
      ...commands,
      probeWorkspaceRepo: () => Promise.resolve(false),
      readConfig,
      readTrackedFiles,
      readText,
    },
  );

  expect({
    exitCode,
    configRoots: readConfig.mock.calls,
    listed: commands.readCommandOutput.mock.calls[0],
    commands: commands.runCommand.mock.calls.map((call) => [call[0], call[1].cwd]),
    out: ctx.output.out.mock.calls,
  }).toStrictEqual({
    exitCode: 0,
    configRoots: [['/repo/.git/rig-bench/run-1/base/packages/kettle']],
    listed: [
      ['git', 'rev-parse', '--show-prefix'],
      { cwd: '/repo/packages/kettle', environment: { PATH: '/bin' } },
    ],
    commands: [
      [
        ['git', 'worktree', 'add', '--detach', '/repo/.git/rig-bench/run-1/base', 'main'],
        '/repo/packages/kettle',
      ],
      [['bun', 'install', '--frozen-lockfile'], '/repo/.git/rig-bench/run-1/base'],
      [
        [
          'bash',
          '/diet.sh',
          '--',
          'bun',
          '/run-bench-file.ts',
          '/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts',
          '--report',
          '/repo/.git/rig-bench/run-1/base.jsonl',
        ],
        '/repo/.git/rig-bench/run-1/base/packages/kettle',
      ],
      [
        [
          'bash',
          '/diet.sh',
          '--',
          'bun',
          '/run-bench-file.ts',
          '/repo/packages/kettle/bench/boil.bench.ts',
          '--report',
          '/repo/.git/rig-bench/run-1/head.jsonl',
        ],
        '/repo/packages/kettle',
      ],
      [
        ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
        '/repo/packages/kettle',
      ],
    ],
    out: [
      [
        'bench  concurrency  base median  base spread  head median  head spread  change\n' +
          'boil   1            40.00ms      2.00ms       44.00ms      3.00ms       +10.0%\n',
      ],
    ],
  });
});

test('it builds and runs the base side with the config of the base checkout', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const baseConfig = defineRig({
    programs: {
      'kettle-cli': {
        package: 'packages/kettle',
        source: 'src/cli.ts',
        build: 'bun build src/cli.ts --outfile dist/old-cli.js',
        artifact: 'dist/old-cli.js',
      },
    },
  });

  await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
    readConfig: () => Promise.resolve(baseConfig),
  });

  expect(
    commands.runCommand.mock.calls.slice(2, 4).map((call) => [call[1].cwd, call[1].environment]),
  ).toStrictEqual([
    ['/repo/.git/rig-bench/run-1/base/packages/kettle', { PATH: '/bin' }],
    [
      '/repo/.git/rig-bench/run-1/base',
      {
        PATH: '/bin',
        RIG_PROGRAM_KETTLE_CLI: '/repo/.git/rig-bench/run-1/base/packages/kettle/dist/old-cli.js',
      },
    ],
  ]);
});

test('it runs the lane hooks of each side from its own root and hands each side its own environment', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const importModule = buildStubLookup<unknown>(
    {
      '/repo/hooks/start-kiln.ts': {
        default: () => Promise.resolve({ environment: { KILN_URL: 'http://localhost:7001' } }),
      },
      '/repo/hooks/stop-kiln.ts': { default: () => Promise.resolve() },
      '/repo/.git/rig-bench/run-1/base/hooks/start-oven.ts': {
        default: () => Promise.resolve({ environment: { OVEN_URL: 'http://localhost:7002' } }),
      },
      '/repo/.git/rig-bench/run-1/base/hooks/stop-oven.ts': { default: () => Promise.resolve() },
    },
    {},
  );

  const headConfig = defineRig({
    lanes: { kiln: { limit: '15s', start: 'hooks/start-kiln.ts', stop: 'hooks/stop-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  const baseConfig = defineRig({
    lanes: { oven: { limit: '15s', start: 'hooks/start-oven.ts', stop: 'hooks/stop-oven.ts' } },
    bench: { lane: 'oven' },
  });

  await runBench(['--base', 'main', 'boil'], headConfig, ctx.run, {
    ...ctx.deps,
    ...commands,
    readConfig: () => Promise.resolve(baseConfig),
    importModule,
  });

  expect({
    imported: importModule.mock.calls,
    benches: commands.runCommand.mock.calls
      .slice(2, 4)
      .map((call) => [call[1].cwd, call[1].environment]),
    lastCommand: commands.runCommand.mock.calls.at(-1)?.[0],
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    imported: [
      ['/repo/.git/rig-bench/run-1/base/hooks/start-oven.ts'],
      ['/repo/.git/rig-bench/run-1/base/hooks/stop-oven.ts'],
      ['/repo/hooks/start-kiln.ts'],
      ['/repo/hooks/stop-kiln.ts'],
    ],
    benches: [
      ['/repo/.git/rig-bench/run-1/base', { PATH: '/bin', OVEN_URL: 'http://localhost:7002' }],
      ['/repo', { PATH: '/bin', KILN_URL: 'http://localhost:7001' }],
    ],
    lastCommand: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it exits 1 with its message and runs no bench when the base cannot be checked out', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [128],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const exitCode = await runBench(['--base', 'kettle-v0'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({
    exitCode,
    commands: commands.runCommand.mock.calls.map((call) => call[0].slice(0, 3)),
    err: ctx.output.err.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    commands: [
      ['git', 'worktree', 'add'],
      ['git', 'worktree', 'remove'],
    ],
    err: [['rig bench: could not check out "kettle-v0"\n']],
  });
});

test('it removes the checkout with an unaborted signal and then the work folder when an abort fails the checkout', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [{ exitCode: 1, abort: ctx.controller }, 128],
    outputs: {
      'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' },
      'git worktree list --porcelain -z': {
        exitCode: 0,
        stdout: 'worktree /repo\0HEAD 1a2b3c\0branch refs/heads/main\0\0',
      },
    },
  });

  const exitCode = await runBench(['--base', 'kettle-v0'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  const removal = commands.runCommand.mock.calls.at(-1);

  expect({
    exitCode,
    removal: { command: removal?.[0], isAborted: removal?.[1].signal.aborted },
    removed: ctx.removeFolder.mock.calls,
    err: ctx.output.err.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    removal: {
      command: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
      isAborted: false,
    },
    removed: [['/repo/.git/rig-bench/run-1']],
    err: [['rig bench: could not check out "kettle-v0"\n']],
  });

  expect(ctx.removeFolder.mock.invocationCallOrder[0]).toBeGreaterThan(
    commands.runCommand.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
  );
});

test('it exits 1 with its message and removes the checkout when bun install fails in it', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, 1],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({
    exitCode,
    commands: commands.runCommand.mock.calls.map((call) => call[0][1]),
    err: ctx.output.err.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    commands: ['worktree', 'install', 'worktree'],
    err: [['rig bench: bun install failed in the checkout of "main"\n']],
  });
});

test('it removes the checkout with an unaborted signal and then the work folder when the run aborts after the checkout', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, { exitCode: 1, abort: ctx.controller }, 0],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  const removal = commands.runCommand.mock.calls.at(-1);

  expect({
    exitCode,
    removal: { command: removal?.[0], isAborted: removal?.[1].signal.aborted },
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    removal: {
      command: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
      isAborted: false,
    },
    removed: [['/repo/.git/rig-bench/run-1']],
  });

  expect(ctx.removeFolder.mock.invocationCallOrder[0]).toBeGreaterThan(
    commands.runCommand.mock.invocationCallOrder.at(-1) ?? Number.POSITIVE_INFINITY,
  );
});

test('it removes the checkout and the work folder and hands the error on when a comparison throws', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  const config = defineRig({
    lanes: { kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  ctx.startKiln.mockImplementation(() => Promise.reject(new Error('the kiln cracked')));

  const running = runBench(['--base', 'main', 'boil'], config, ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect(running).rejects.toThrow('the kiln cracked');

  await Promise.allSettled([running]);

  expect({
    lastCommand: commands.runCommand.mock.calls.at(-1)?.[0],
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    lastCommand: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it exits 1, says how to remove the checkout and keeps the work folder when git still lists the checkout it could not remove', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, 1, 1],
    outputs: {
      'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' },
      'git worktree list --porcelain -z': {
        exitCode: 0,
        stdout:
          'worktree /repo\0HEAD 1a2b3c\0branch refs/heads/main\0\0' +
          'worktree /repo/.git/rig-bench/run-1/base\0HEAD 4d5e6f\0detached\0\0',
      },
    },
  });

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({
    exitCode,
    err: ctx.output.err.mock.calls,
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    err: [
      ['rig bench: bun install failed in the checkout of "main"\n'],
      [
        'rig bench: could not remove the checkout at /repo/.git/rig-bench/run-1/base; remove it with git worktree remove --force /repo/.git/rig-bench/run-1/base\n',
      ],
    ],
    removed: [],
  });
});

test('it fails a comparison whose benches pass when git still lists the checkout it could not remove', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, 0, 0, 0, 1],
    outputs: {
      'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' },
      'git worktree list --porcelain -z': {
        exitCode: 0,
        stdout:
          'worktree /repo\0HEAD 1a2b3c\0branch refs/heads/main\0\0' +
          'worktree /repo/.git/rig-bench/run-1/base\0HEAD 4d5e6f\0detached\0\0',
      },
    },
  });

  const exitCode = await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect(exitCode).toBe(1);
});

test('it keeps the work folder and says how to remove the checkout when git still lists the checkout of a failed add', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [128, 1],
    outputs: {
      'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' },
      'git worktree list --porcelain -z': {
        exitCode: 0,
        stdout:
          'worktree /repo\0HEAD 1a2b3c\0branch refs/heads/main\0\0' +
          'worktree /repo/.git/rig-bench/run-1/base\0HEAD 4d5e6f\0detached\0\0',
      },
    },
  });

  const exitCode = await runBench(['--base', 'kettle-v0'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({
    exitCode,
    listed: commands.readCommandOutput.mock.calls.at(-1),
    err: ctx.output.err.mock.calls,
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    listed: [
      ['git', 'worktree', 'list', '--porcelain', '-z'],
      { cwd: '/repo', environment: { PATH: '/bin' } },
    ],
    err: [
      ['rig bench: could not check out "kettle-v0"\n'],
      [
        'rig bench: could not remove the checkout at /repo/.git/rig-bench/run-1/base; remove it with git worktree remove --force /repo/.git/rig-bench/run-1/base\n',
      ],
    ],
    removed: [],
  });
});

test('it removes the work folder and prints only the checkout message when git lists no checkout of a failed add', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [128, 1],
    outputs: {
      'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' },
      'git worktree list --porcelain -z': {
        exitCode: 0,
        stdout: 'worktree /repo\0HEAD 1a2b3c\0branch refs/heads/main\0\0',
      },
    },
  });

  const exitCode = await runBench(['--base', 'kettle-v0'], defineRig({}), ctx.run, {
    ...ctx.deps,
    ...commands,
  });

  expect({
    exitCode,
    err: ctx.output.err.mock.calls,
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    err: [['rig bench: could not check out "kettle-v0"\n']],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it removes the work folder after a run', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  await runBench([], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect(ctx.removeFolder).toHaveBeenCalledExactlyOnceWith('/repo/.git/rig-bench/run-1');
});

test('it removes the work folder and the checkout when a bench fails', async () => {
  const ctx = setupTest();

  const commands = buildStubCommandAnswers({
    exitCodes: [0, 0, 1, 1],
    outputs: { 'git rev-parse --show-prefix': { exitCode: 0, stdout: '\n' } },
  });

  await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, { ...ctx.deps, ...commands });

  expect({
    lastCommand: commands.runCommand.mock.calls.at(-1)?.[0],
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    lastCommand: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it removes the work folder when a lane hook throws', async () => {
  const ctx = setupTest();
  const commands = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  const config = defineRig({
    lanes: { kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  ctx.startKiln.mockImplementation(() => Promise.reject(new Error('the kiln cracked')));

  const running = runBench([], config, ctx.run, { ...ctx.deps, ...commands });

  expect(running).rejects.toThrow('the kiln cracked');

  await Promise.allSettled([running]);

  expect(ctx.removeFolder).toHaveBeenCalledExactlyOnceWith('/repo/.git/rig-bench/run-1');
});
