import { expect, mock, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { runBench } from './run-bench.ts';
import type { CommandOptions } from './run-command.ts';
import { makeRecordingStub } from './test-utils/make-recording-stub.ts';

function setupTest() {
  const signal = new AbortController().signal;

  const exitCodes: number[] = [];

  const reports = new Map<string, string>();

  const startKiln = mock<() => Promise<unknown>>(() =>
    Promise.resolve({ environment: { KILN_URL: 'http://localhost:7001' } }),
  );

  const stopKiln = mock<() => Promise<unknown>>(() => Promise.resolve());

  const runCommand = mock<(command: readonly string[], options: CommandOptions) => Promise<number>>(
    () => Promise.resolve(exitCodes.shift() ?? 0),
  );

  const removeFolder = mock<(path: string) => Promise<void>>(() => Promise.resolve());
  const output = { out: makeRecordingStub(), err: makeRecordingStub() };

  return {
    exitCodes,
    reports,
    runCommand,
    removeFolder,
    output,
    startKiln,
    stopKiln,
    run: { repoRoot: '/repo', environment: { PATH: '/bin' }, signal, runID: '1' },
    deps: {
      dietScript: '/diet.sh',
      benchScript: '/run-bench-file.ts',
      output,
      runCommand,
      readConfig: () => Promise.resolve(defineRig({})),
      probeWorkspaceRepo: () => Promise.resolve(true),
      readTrackedFiles: () =>
        Promise.resolve([
          'packages/kettle/package.json',
          'packages/kettle/bench/boil.bench.ts',
          'packages/kettle/bench/steep.bench.ts',
        ]),
      importModule: (path: string) =>
        Promise.resolve({ default: path.endsWith('start-kiln.ts') ? startKiln : stopKiln }),
      createWorkFolder: () => Promise.resolve('/repo/.git/rig-bench/run-1'),
      readText: (path: string) => Promise.resolve(reports.get(path) ?? null),
      removeFolder,
    },
  };
}

test('it runs each bench file in a process of its own under diet, with the head report', async () => {
  const ctx = setupTest();

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
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

  ctx.exitCodes.push(1, 0);

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
  expect(ctx.runCommand).toHaveBeenCalledTimes(2);
});

test('it exits 1 when a head entry is over its budget and no base is given', async () => {
  const ctx = setupTest();

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":4,"spreadMs":0.5,"budgetMs":50}\n' +
      '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":4,"medianMs":61,"spreadMs":3,"budgetMs":50}\n',
  );

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
});

test('it exits 0 when every entry is within budget', async () => {
  const ctx = setupTest();

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":4,"spreadMs":0.5,"budgetMs":50}\n' +
      '{"file":"/repo/packages/kettle/bench/steep.bench.ts","name":"steep","concurrency":1,"medianMs":12,"spreadMs":1,"budgetMs":20}\n',
  );

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
});

test('it exits 1 and names the line when the report holds a line that is no entry', async () => {
  const ctx = setupTest();

  ctx.reports.set('/repo/.git/rig-bench/run-1/head.jsonl', 'the kettle boiled\n');

  const exitCode = await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect({ exitCode, err: ctx.output.err.mock.calls }).toStrictEqual({
    exitCode: 1,
    err: [['rig bench: the bench report holds a line that is no entry: the kettle boiled\n']],
  });
});

test('it runs only the benchmark that the name picks', async () => {
  const ctx = setupTest();

  await runBench(['steep'], defineRig({}), ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls.map((call) => call[0])).toStrictEqual([
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

  const exitCode = await runBench(['brew'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig bench: no benchmark named "brew"; the benchmarks are boil, steep\n',
  );
});

test('it says so and exits 0 when the repo has no benchmark', async () => {
  const ctx = setupTest();

  const exitCode = await runBench([], defineRig({}), ctx.run, {
    ...ctx.deps,
    readTrackedFiles: () => Promise.resolve([]),
  });

  expect(exitCode).toBe(0);
  expect(ctx.output.out).toHaveBeenCalledExactlyOnceWith('rig: the repo has no benchmarks\n');
});

test('it runs the start hook of the bench lane first, hands its environment on, and runs the stop hook after', async () => {
  const ctx = setupTest();

  const config = defineRig({
    lanes: {
      kiln: { limit: '15s', start: 'test-utils/start-kiln.ts', stop: 'test-utils/stop-kiln.ts' },
    },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
  expect(ctx.startKiln).toHaveBeenCalledTimes(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);

  expect(ctx.runCommand.mock.calls[0]?.[1].environment).toStrictEqual({
    PATH: '/bin',
    KILN_URL: 'http://localhost:7001',
  });
});

test('it runs the stop hook of the bench lane even when a benchmark fails', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(1, 1);

  const config = defineRig({
    lanes: { kiln: { limit: '15s', stop: 'test-utils/stop-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
  expect(ctx.stopKiln).toHaveBeenCalledTimes(1);
});

test('it exits 2 and says why for more than one name', async () => {
  const ctx = setupTest();

  const exitCode = await runBench(['boil', 'steep'], defineRig({}), ctx.run, ctx.deps);

  expect({ exitCode, err: ctx.output.err.mock.calls }).toStrictEqual({
    exitCode: 2,
    err: [['rig bench: takes at most one benchmark name\n']],
  });
});

test('it builds each program once in its package folder and hands its artifact path to the benchmarks', async () => {
  const ctx = setupTest();

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

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(0);

  expect(ctx.runCommand.mock.calls[0]).toStrictEqual([
    ['bash', '-c', 'bun build src/cli.ts --outfile dist/cli.js'],
    { cwd: '/repo/packages/kettle', environment: { PATH: '/bin' }, signal: ctx.run.signal },
  ]);

  expect(ctx.runCommand.mock.calls.slice(1).map((call) => call[1].environment)).toStrictEqual([
    { PATH: '/bin', RIG_PROGRAM_KETTLE_CLI: '/repo/packages/kettle/dist/cli.js' },
    { PATH: '/bin', RIG_PROGRAM_KETTLE_CLI: '/repo/packages/kettle/dist/cli.js' },
  ]);
});

test('it fails with the program name when a build fails, and runs no benchmark', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(3);

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

  const exitCode = await runBench([], config, ctx.run, ctx.deps);

  expect(exitCode).toBe(3);
  expect(ctx.runCommand).toHaveBeenCalledTimes(1);

  expect(ctx.output.err).toHaveBeenCalledExactlyOnceWith(
    'rig: the build of program "kettle-cli" failed with exit code 3: bun build src/cli.ts --outfile dist/cli.js\n',
  );
});

test('it checks the base out, runs the base side and then the head side, and removes the checkout', async () => {
  const ctx = setupTest();

  await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, ctx.deps);

  expect(ctx.runCommand.mock.calls.map((call) => [call[0], call[1].cwd])).toStrictEqual([
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

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/base.jsonl',
    '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":1,"medianMs":12.1,"spreadMs":0.8,"budgetMs":80}\n' +
      '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":4,"medianMs":30.4,"spreadMs":2.1,"budgetMs":80}\n',
  );

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":1,"medianMs":11.5,"spreadMs":0.7,"budgetMs":80}\n' +
      '{"file":"/repo/packages/kettle/bench/pour.bench.ts","name":"pour one cup","concurrency":4,"medianMs":33.2,"spreadMs":2.4,"budgetMs":80}\n',
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, ctx.deps);

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

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/base.jsonl',
    '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":70,"spreadMs":2,"budgetMs":50}\n',
  );

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":40,"spreadMs":2,"budgetMs":50}\n',
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(0);
});

test('it fails a comparison whose head entry is over its budget', async () => {
  const ctx = setupTest();

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"boil","concurrency":1,"medianMs":70,"spreadMs":2,"budgetMs":50}\n',
  );

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
});

test('it fails a comparison whose base side fails', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(0, 0, 1);

  const exitCode = await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, ctx.deps);

  expect(exitCode).toBe(1);
});

test('it compares a named benchmark that only the base has, with a dash on the head', async () => {
  const ctx = setupTest();

  const trackedFiles = new Map([
    ['/repo', ['packages/kettle/package.json', 'packages/kettle/bench/boil.bench.ts']],
    [
      '/repo/.git/rig-bench/run-1/base',
      ['packages/kettle/package.json', 'packages/kettle/bench/brew.bench.ts'],
    ],
  ]);

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/base.jsonl',
    '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/brew.bench.ts","name":"brew","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n',
  );

  const exitCode = await runBench(['--base', 'main', 'brew'], defineRig({}), ctx.run, {
    ...ctx.deps,
    readTrackedFiles: (root: string) => Promise.resolve(trackedFiles.get(root) ?? []),
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

  const trackedFiles = new Map([
    [
      '/repo',
      [
        'packages/kettle/package.json',
        'packages/kettle/bench/boil.bench.ts',
        'packages/kettle/bench/steep.bench.ts',
      ],
    ],
    [
      '/repo/.git/rig-bench/run-1/base',
      [
        'packages/kettle/package.json',
        'packages/kettle/bench/steep.bench.ts',
        'packages/kettle/bench/pour.bench.ts',
      ],
    ],
  ]);

  const exitCode = await runBench(['--base', 'main', 'brew'], defineRig({}), ctx.run, {
    ...ctx.deps,
    readTrackedFiles: (root: string) => Promise.resolve(trackedFiles.get(root) ?? []),
  });

  expect({
    exitCode,
    err: ctx.output.err.mock.calls,
    lastCommand: ctx.runCommand.mock.calls.at(-1)?.[0],
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

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/base.jsonl',
    '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/boil.bench.ts","name":"pour","concurrency":1,"medianMs":40,"spreadMs":2,"budgetMs":80}\n' +
      '{"file":"/repo/.git/rig-bench/run-1/base/packages/kettle/bench/steep.bench.ts","name":"pour","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n',
  );

  ctx.reports.set(
    '/repo/.git/rig-bench/run-1/head.jsonl',
    '{"file":"/repo/packages/kettle/bench/steep.bench.ts","name":"pour","concurrency":1,"medianMs":12,"spreadMs":0.5,"budgetMs":80}\n' +
      '{"file":"/repo/packages/kettle/bench/boil.bench.ts","name":"pour","concurrency":1,"medianMs":44,"spreadMs":3,"budgetMs":80}\n',
  );

  await runBench(['--base', 'main'], defineRig({}), ctx.run, ctx.deps);

  expect(ctx.output.out.mock.calls).toStrictEqual([
    [
      'bench                                        concurrency  base median  base spread  head median  head spread  change\n' +
        'pour (packages/kettle/bench/steep.bench.ts)  1            12.00ms      0.50ms       12.00ms      0.50ms       +0.0%\n' +
        'pour (packages/kettle/bench/boil.bench.ts)   1            40.00ms      2.00ms       44.00ms      3.00ms       +10.0%\n',
    ],
  ]);
});

test('it builds and runs the base side with the config of the base checkout', async () => {
  const ctx = setupTest();

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
    readConfig: () => Promise.resolve(baseConfig),
  });

  expect(
    ctx.runCommand.mock.calls.slice(2, 4).map((call) => [call[1].cwd, call[1].environment]),
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

test('it exits 1 with its message and runs no bench when the base cannot be checked out', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(128);

  const exitCode = await runBench(['--base', 'kettle-v0'], defineRig({}), ctx.run, ctx.deps);

  expect({
    exitCode,
    commands: ctx.runCommand.mock.calls.length,
    err: ctx.output.err.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    commands: 1,
    err: [['rig bench: could not check out "kettle-v0"\n']],
  });
});

test('it exits 1 with its message and removes the checkout when bun install fails in it', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(0, 1);

  const exitCode = await runBench(['--base', 'main'], defineRig({}), ctx.run, ctx.deps);

  expect({
    exitCode,
    commands: ctx.runCommand.mock.calls.map((call) => call[0][1]),
    err: ctx.output.err.mock.calls,
  }).toStrictEqual({
    exitCode: 1,
    commands: ['worktree', 'install', 'worktree'],
    err: [['rig bench: bun install failed in the checkout of "main"\n']],
  });
});

test('it removes the work folder after a run', async () => {
  const ctx = setupTest();

  await runBench([], defineRig({}), ctx.run, ctx.deps);

  expect(ctx.removeFolder).toHaveBeenCalledExactlyOnceWith('/repo/.git/rig-bench/run-1');
});

test('it removes the work folder and the checkout when a bench fails', async () => {
  const ctx = setupTest();

  ctx.exitCodes.push(0, 0, 1, 1);

  await runBench(['--base', 'main', 'boil'], defineRig({}), ctx.run, ctx.deps);

  expect({
    lastCommand: ctx.runCommand.mock.calls.at(-1)?.[0],
    removed: ctx.removeFolder.mock.calls,
  }).toStrictEqual({
    lastCommand: ['git', 'worktree', 'remove', '--force', '/repo/.git/rig-bench/run-1/base'],
    removed: [['/repo/.git/rig-bench/run-1']],
  });
});

test('it removes the work folder when a lane hook throws', async () => {
  const ctx = setupTest();

  const config = defineRig({
    lanes: { kiln: { limit: '15s', start: 'test-utils/start-kiln.ts' } },
    bench: { lane: 'kiln' },
  });

  ctx.startKiln.mockImplementation(() => Promise.reject(new Error('the kiln cracked')));

  const running = runBench([], config, ctx.run, ctx.deps);

  expect(running).rejects.toThrow('the kiln cracked');

  await Promise.allSettled([running]);

  expect(ctx.removeFolder).toHaveBeenCalledExactlyOnceWith('/repo/.git/rig-bench/run-1');
});
