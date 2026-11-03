import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startProgram } from './start-program.ts';

function setupTest() {
  const previous = process.env['RIG_PROGRAM_TINY'];

  process.env['RIG_PROGRAM_TINY'] = join(import.meta.dir, '../test-utils/run-tiny-program.ts');

  onTestFinished(() => {
    if (previous === undefined) {
      delete process.env['RIG_PROGRAM_TINY'];
    } else {
      process.env['RIG_PROGRAM_TINY'] = previous;
    }
  });
}

test('it waits for a url to answer 2xx and hands back the base url and the port', async () => {
  setupTest();

  await using program = await startProgram('tiny', {
    args: ['serve'],
    ready: { url: '/health' },
  });

  const response = await fetch(`${program.url}/health`);

  expect(program.url).toBe(`http://127.0.0.1:${program.port}`);

  const body = await response.text();

  expect(body).toBe('ok');
});

test('it waits for a stdout line that matches', async () => {
  setupTest();

  await using program = await startProgram('tiny', {
    args: ['serve'],
    ready: { stdout: /^listening on \d+$/u },
  });

  expect(program.output()).toContain(`listening on ${program.port}`);
});

test('it stops the program with SIGTERM by default and returns its exit code', async () => {
  setupTest();

  const program = await startProgram('tiny', { args: ['serve'], ready: { url: '/health' } });
  const exitCode = await program.stop();

  expect(exitCode).toBe(0);
});

test('it returns 128 plus the signal number when the signal kills the program', async () => {
  setupTest();

  const program = await startProgram('tiny', { args: ['mute'] });
  const exitCode = await program.stop('SIGKILL');

  expect(exitCode).toBe(137);
});

test('it throws with the output when the program exits before it is ready', async () => {
  setupTest();

  const started = startProgram('tiny', { args: ['nonsense'], ready: { url: '/health' } });

  await expect(started).rejects.toThrow(
    /program tiny exited before it was ready \(exit code 64\); its output:\nunknown mode nonsense/u,
  );
});

test('it kills a program with SIGKILL when its handle is disposed', async () => {
  setupTest();

  const program = await startProgram('tiny', { args: ['mute'] });

  await program[Symbol.asyncDispose]();

  const exitCode = await program.stop();

  expect(exitCode).toBe(137);
});
