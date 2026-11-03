import { expect, test } from 'bun:test';
import { run } from '../src/process/index.ts';
import { buildProcessFixtureCommand } from '../src/test-utils/build-process-fixture-command.ts';
import { probeProcess } from '../src/test-utils/probe-process.ts';

function setupTest() {
  return { command: buildProcessFixtureCommand() };
}

test('it runs the program to its exit and returns what it printed', async () => {
  const ctx = setupTest();

  const result = await run(ctx.command, { args: ['echo', 'boil', 'err:steam'] });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'boil\n', stderr: 'steam\n' });
});

test('it returns the exit code of a program that fails', async () => {
  const ctx = setupTest();

  const result = await run(ctx.command, { args: ['exit', '7'] });

  expect(result.exitCode).toBe(7);
});

test('it adds the environment the caller names', async () => {
  const ctx = setupTest();

  const result = await run(ctx.command, {
    args: ['env', 'KETTLE_MODE'],
    env: { KETTLE_MODE: 'rolling' },
  });

  expect(result.stdout).toBe('rolling\n');
});

test('it runs the program in the folder the caller names', async () => {
  const ctx = setupTest();

  const result = await run(ctx.command, { args: ['cwd'], cwd: '/usr' });

  expect(result.stdout).toBe('/usr\n');
});

test('it writes the input to stdin and closes it', async () => {
  const ctx = setupTest();

  const result = await run(ctx.command, { args: ['reply'], input: 'kettle\ncup\n' });

  expect(result.stdout).toBe('got kettle\ngot cup\ndone\n');
});

test('it returns 128 plus the signal number when a signal kills the program', async () => {
  const result = await run(['sh', '-c', 'kill -TERM $$']);

  expect(result.exitCode).toBe(143);
});

test('it kills the program and throws with its output when it runs past the time limit', () => {
  const ctx = setupTest();
  const running = run(ctx.command, { args: ['fork'], timeoutMs: 1000 });

  expect(running).rejects.toThrow(/did not exit in 1000 ms; its output:\nchild \d+\n$/u);
});

test('it stops a child that the program forks when the time limit passes', async () => {
  const ctx = setupTest();

  const failure: unknown = await run(ctx.command, { args: ['fork'], timeoutMs: 1000 }).then(
    () => null,
    (error: unknown) => error,
  );

  const childPid = Number(/child (?<pid>\d+)/u.exec(String(failure))?.groups?.['pid']);

  expect(childPid).toBeGreaterThan(0);
  expect(probeProcess(childPid)).toBeFalse();
});

test('it fails at the time limit when a descendant holds the output pipes after the exit', async () => {
  const startedAt = Date.now();
  const running = run(['sh', '-c', 'sleep 5 & echo parent-exited'], { timeoutMs: 300 });

  const failure = await running.then(
    () => null,
    (error: unknown) => error,
  );

  expect(String(failure)).toMatch(/did not exit in 300 ms; its output:\nparent-exited\n$/u);
  expect(Date.now() - startedAt).toBeLessThan(2000);
});
