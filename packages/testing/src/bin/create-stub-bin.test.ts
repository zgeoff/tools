import { expect, onTestFinished, test } from 'bun:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { waitFor } from '../core/wait-for.ts';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { run } from '../process/index.ts';
import { createStubBin } from './create-stub-bin.ts';

function setupTest() {
  const directory = createTempDir('stub-bin').path;

  return { directory };
}

test('it answers each call from the first matching answer that has not answered yet', async () => {
  const ctx = setupTest();

  const gh = createStubBin(ctx.directory, 'gh', {
    answers: [
      { args: ['pr', 'view'], stdout: '{"number":7}\n' },
      { args: ['pr', 'merge'], exitCode: 1, stderr: 'merge conflict\n' },
      { args: ['pr', 'merge'], stdout: '' },
    ],
  });

  const view = await run([gh.path, 'pr', 'view', '7', '--json', 'number']);
  const firstMerge = await run([gh.path, 'pr', 'merge', '7']);
  const secondMerge = await run([gh.path, 'pr', 'merge', '7']);

  expect([view, firstMerge, secondMerge]).toStrictEqual([
    { exitCode: 0, stdout: '{"number":7}\n', stderr: '' },
    { exitCode: 1, stdout: '', stderr: 'merge conflict\n' },
    { exitCode: 0, stdout: '', stderr: '' },
  ]);
});

test('it answers again with the last matching answer once every matching answer has answered', async () => {
  const ctx = setupTest();

  const gh = createStubBin(ctx.directory, 'gh', {
    answers: [
      { args: ['pr', 'list'], stdout: 'first\n' },
      { args: ['pr', 'list'], stdout: 'last\n' },
    ],
  });

  const outputs = [];

  for (let call = 0; call < 4; call += 1) {
    const result = await run([gh.path, 'pr', 'list']);

    outputs.push(result.stdout);
  }

  expect(outputs).toStrictEqual(['first\n', 'last\n', 'last\n', 'last\n']);
});

test('it matches an answer by the start of the argv, and ignores the flags after it', async () => {
  const ctx = setupTest();

  const gh = createStubBin(ctx.directory, 'gh', {
    answers: [{ args: ['pr', 'view'], stdout: 'matched\n' }],
  });

  const result = await run([gh.path, 'pr', 'view', '--json', 'number', '--repo', 'wren/kite']);

  expect(result.stdout).toBe('matched\n');
});

test('it exits every call 0 with no output when it has no answers', async () => {
  const ctx = setupTest();
  const notify = createStubBin(ctx.directory, 'notify-send');

  const result = await run([notify.path, 'build', 'done']);

  expect(result).toStrictEqual({ exitCode: 0, stdout: '', stderr: '' });
});

test('it exits 97 with the argv on stderr for a call that matches no answer, after it records the call', async () => {
  const ctx = setupTest();

  const gh = createStubBin(ctx.directory, 'gh', {
    answers: [{ args: ['pr', 'view'], stdout: 'matched\n' }],
  });

  const result = await run([gh.path, 'issue', 'list', '--json', 'number']);

  expect({ result, calls: gh.readCalls().map((call) => call.argv) }).toStrictEqual({
    result: { exitCode: 97, stdout: '', stderr: 'unexpected: gh issue list --json number\n' },
    calls: [['issue', 'list', '--json', 'number']],
  });
});

test('it exits 97 for every call when the answers are an empty list', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh', { answers: [] });

  const result = await run([gh.path, 'pr', 'view']);

  expect(result.exitCode).toBe(97);
});

test('it writes the answer text to stdout and stderr byte for byte, with no shell in between', async () => {
  const ctx = setupTest();
  const text = `$HOME \`id\` "quoted" 'single' \\n %s \r\n tab\t café 日本\n`;

  const gh = createStubBin(ctx.directory, 'gh', {
    answers: [{ args: [], stdout: text, stderr: text }],
  });

  const result = await run([gh.path]);

  expect(result).toStrictEqual({ exitCode: 0, stdout: text, stderr: text });
});

test('it gives each of two calls at the same time its own unused answer', async () => {
  const ctx = setupTest();
  const outcomes: string[] = [];

  for (let round = 0; round < 12; round += 1) {
    const gh = createStubBin(ctx.directory, 'gh', {
      answers: [
        { args: ['next'], stdout: 'a' },
        { args: ['next'], stdout: 'b' },
      ],
    });

    const results = await Promise.all([run([gh.path, 'next']), run([gh.path, 'next'])]);

    outcomes.push(
      results
        .map((result) => result.stdout)
        .toSorted()
        .join(''),
    );
  }

  expect(outcomes).toStrictEqual(Array.from({ length: 12 }, () => 'ab'));
});

test('it records the call: name, argv exactly as given, and the working folder', async () => {
  const ctx = setupTest();
  const repo = createTempDir('stub-cwd').path;
  const gh = createStubBin(ctx.directory, 'gh');

  await run([gh.path, 'pr', 'view', '7', '--json', 'a b', ''], { cwd: repo });

  expect(gh.readCalls()).toStrictEqual([
    {
      name: 'gh',
      argv: ['pr', 'view', '7', '--json', 'a b', ''],
      cwd: expect.stringContaining('stub-cwd'),
      env: {},
      stdin: '',
    },
  ]);

  expect(readFileSync(join(ctx.directory, 'calls.jsonl'), 'utf8')).toContain(repo.slice(-12));
});

test('it records only the env names that were set', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh', { recordEnv: ['GH_TOKEN', 'GH_HOST'] });

  await run([gh.path], { env: { GH_TOKEN: 'test-token', GH_HOST: undefined } });

  expect(gh.readCalls()[0]?.env).toStrictEqual({ GH_TOKEN: 'test-token' });
});

test('it records all of stdin up to EOF with recordStdin', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh', { recordStdin: true });

  await run([gh.path, 'api', '--input', '-'], { input: '{"title":"héllo"}\nsecond line' });

  expect(gh.readCalls()[0]?.stdin).toBe('{"title":"héllo"}\nsecond line');
});

test('it records stdin as empty without recordStdin', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh');

  await run([gh.path], { input: 'ignored' });

  expect(gh.readCalls()[0]?.stdin).toBe('');
});

test('it waits for EOF on stdin with recordStdin, and exits once stdin closes', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh', { recordStdin: true });
  const child = Bun.spawn([gh.path], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });

  onTestFinished(() => {
    child.kill();
  });

  const startedAtMs = performance.now();

  await waitFor(() => {
    if (performance.now() - startedAtMs < 300) {
      throw new Error('not yet');
    }
  });

  const exitCodeBefore = child.exitCode;

  await child.stdin.end();

  const exitCode = await child.exited;

  expect({ exitCodeBefore, exitCode }).toStrictEqual({ exitCodeBefore: null, exitCode: 0 });
});

test('it runs the script in place of answers, and passes it the argv, stdin and env', async () => {
  const ctx = setupTest();

  const sudo = createStubBin(ctx.directory, 'sudo', {
    script: '#!/bin/sh\necho "args:$*"\ncat\necho "seen:$KIT_SEEN" >&2\nexit 5\n',
  });

  const result = await run([sudo.path, 'ls', '-l'], {
    input: 'piped text\n',
    env: { KIT_SEEN: 'yes' },
  });

  expect(result).toStrictEqual({
    exitCode: 5,
    stdout: 'args:ls -l\npiped text\n',
    stderr: 'seen:yes\n',
  });
});

test('it records a call to a script stand-in before the script runs', async () => {
  const ctx = setupTest();

  const sudo = createStubBin(ctx.directory, 'sudo', {
    script: '#!/bin/sh\nexec "$@"\n',
    recordEnv: ['KIT_SEEN'],
  });

  const result = await run([sudo.path, 'echo', 'hello'], { env: { KIT_SEEN: 'yes' } });

  expect({ stdout: result.stdout, calls: sudo.readCalls() }).toStrictEqual({
    stdout: 'hello\n',
    calls: [
      {
        name: 'sudo',
        argv: ['echo', 'hello'],
        cwd: expect.any(String),
        env: { KIT_SEEN: 'yes' },
        stdin: '',
      },
    ],
  });
});

test('it records stdin and passes the same bytes to the script with recordStdin', async () => {
  const ctx = setupTest();

  const tee = createStubBin(ctx.directory, 'tee-stub', {
    script: '#!/bin/sh\ncat\n',
    recordStdin: true,
  });

  const result = await run([tee.path], { input: 'line one\nline two' });

  expect({ stdout: result.stdout, recorded: tee.readCalls()[0]?.stdin }).toStrictEqual({
    stdout: 'line one\nline two',
    recorded: 'line one\nline two',
  });
});

test.each([
  ['SIGINT', false],
  ['SIGINT', true],
  ['SIGTERM', false],
  ['SIGTERM', true],
  ['SIGHUP', false],
  ['SIGHUP', true],
] as const)('it passes %s on to the script, with recordStdin %p', async (signal, recordStdin) => {
  const ctx = setupTest();
  const marker = join(ctx.directory, 'trapped');
  const ready = join(ctx.directory, 'ready');

  const waiter = createStubBin(ctx.directory, 'waiter', {
    script: `#!/bin/sh\ntrap 'echo trapped > ${marker}; exit 0' INT TERM HUP\necho up > ${ready}\nwhile true; do sleep 0.05; done\n`,
    recordStdin,
  });

  const child = Bun.spawn([waiter.path], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  await child.stdin.end();

  await waitFor(() => readFileSync(ready, 'utf8'));

  child.kill(signal);

  const exitCode = await child.exited;

  expect({ exitCode, marker: readFileSync(marker, 'utf8') }).toStrictEqual({
    exitCode: 0,
    marker: 'trapped\n',
  });
});

test('it exits 128 plus the signal number when a signal ends the script', async () => {
  const ctx = setupTest();
  const ready = join(ctx.directory, 'ready');

  const waiter = createStubBin(ctx.directory, 'waiter', {
    script: `#!/bin/sh\necho up > ${ready}\nwhile true; do sleep 0.05; done\n`,
  });

  const child = Bun.spawn([waiter.path], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  await waitFor(() => readFileSync(ready, 'utf8'));

  child.kill('SIGHUP');

  const exitCode = await child.exited;

  expect(exitCode).toBe(129);
});

test('it appends every stand-in of one folder to one log, in call order', async () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh');
  const op = createStubBin(ctx.directory, 'op');

  await run([gh.path, 'one']);
  await run([op.path, 'two']);
  await run([gh.path, 'three']);

  const logged = readFileSync(join(ctx.directory, 'calls.jsonl'), 'utf8').trim().split('\n');

  expect({
    lines: logged.length,
    gh: gh.readCalls().map((call) => call.argv),
    op: op.readCalls().map((call) => call.argv),
  }).toStrictEqual({ lines: 3, gh: [['one'], ['three']], op: [['two']] });
});

test('it replaces a stand-in whole when it is created again, resets its answers, and keeps the log', async () => {
  const ctx = setupTest();

  const first = createStubBin(ctx.directory, 'gh', {
    answers: [
      { args: [], stdout: 'a\n' },
      { args: [], stdout: 'b\n' },
    ],
  });

  await run([first.path]);

  const second = createStubBin(ctx.directory, 'gh', {
    answers: [
      { args: [], stdout: 'a\n' },
      { args: [], stdout: 'b\n' },
    ],
  });

  const again = await run([second.path]);

  const scripted = createStubBin(ctx.directory, 'gh', { script: '#!/bin/sh\necho scripted\n' });

  const result = await run([scripted.path]);

  expect({
    again: again.stdout,
    result: result.stdout,
    calls: scripted.readCalls().length,
  }).toStrictEqual({ again: 'a\n', result: 'scripted\n', calls: 3 });
});

test('it writes a Bun script whose shebang is the path of the running Bun, and no shell', () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh', { answers: [] });
  const [shebang] = readFileSync(gh.path, 'utf8').split('\n');

  expect(shebang).toBe(`#!${process.execPath}`);
});

test('it renames a staged file into place, so a rewrite never writes into the file that a process runs', () => {
  const ctx = setupTest();
  const first = createStubBin(ctx.directory, 'gh', { answers: [] });
  const inodeBefore = statSync(first.path).ino;
  const second = createStubBin(ctx.directory, 'gh', { answers: [] });

  expect(statSync(second.path).ino).not.toBe(inodeBefore);
});

test('it leaves no staged file behind in the folder', () => {
  const ctx = setupTest();

  createStubBin(ctx.directory, 'gh', { answers: [] });

  expect(readdirSync(ctx.directory).filter((entry) => entry.includes('staged'))).toStrictEqual([]);
});

test('it keeps the stand-in at <directory>/<name>', () => {
  const ctx = setupTest();
  const gh = createStubBin(ctx.directory, 'gh');

  expect({ path: gh.path, exists: existsSync(gh.path) }).toStrictEqual({
    path: join(ctx.directory, 'gh'),
    exists: true,
  });
});
