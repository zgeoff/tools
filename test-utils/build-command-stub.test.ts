import { expect, test } from 'bun:test';
import { buildCommandStub } from './build-command-stub.ts';

test('it answers a command with the result for its exact argv', async () => {
  const stub = buildCommandStub();

  stub.answer(['gh', 'api', 'user'], { exitCode: 0, stdout: 'octo\n', stderr: '' });

  const result = await stub.runCommand(['gh', 'api', 'user'], { cwd: '.', env: {} });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'octo\n', stderr: '' });
  expect(stub.calls).toStrictEqual([['gh', 'api', 'user']]);
});

test('it rejects a command whose argv differs by one argument from every answer', async () => {
  const stub = buildCommandStub();

  stub.answer(['gh', 'api', '-f', 'status=success'], { exitCode: 0, stdout: '', stderr: '' });

  const rejection = await stub.runCommand(['gh', 'api'], { cwd: '.', env: {} }).then(
    () => null,
    (error: unknown) => error,
  );

  expect(rejection).toStrictEqual(new Error('the stub has no answer for: gh api'));
  expect(stub.calls).toStrictEqual([['gh', 'api']]);
});

test('it answers with the latest result set for an argv', async () => {
  const stub = buildCommandStub();

  stub.answer(['gh', 'auth', 'status'], { exitCode: 0, stdout: '', stderr: '' });
  stub.answer(['gh', 'auth', 'status'], { exitCode: 1, stdout: '', stderr: 'logged out\n' });

  const result = await stub.runCommand(['gh', 'auth', 'status'], { cwd: '.', env: {} });

  expect(result).toStrictEqual({ exitCode: 1, stdout: '', stderr: 'logged out\n' });
});

test('it hands the commands of the pass-through program to its runner', async () => {
  const stub = buildCommandStub({
    program: 'git',
    runCommand: (argv) =>
      Promise.resolve({ exitCode: 0, stdout: `ran ${argv.join(' ')}\n`, stderr: '' }),
  });

  const result = await stub.runCommand(['git', 'status'], { cwd: '.', env: {} });

  expect(result).toStrictEqual({ exitCode: 0, stdout: 'ran git status\n', stderr: '' });
  expect(stub.calls).toStrictEqual([['git', 'status']]);
});

test('it answers an argv of the pass-through program that a test answered, and runs the rest', async () => {
  const stub = buildCommandStub({
    program: 'git',
    runCommand: (argv) =>
      Promise.resolve({ exitCode: 0, stdout: `ran ${argv.join(' ')}\n`, stderr: '' }),
  });

  stub.answer(['git', 'show', 'HEAD:oven.yml'], { exitCode: 128, stdout: '', stderr: 'fatal\n' });

  const answered = await stub.runCommand(['git', 'show', 'HEAD:oven.yml'], { cwd: '.', env: {} });
  const ran = await stub.runCommand(['git', 'status'], { cwd: '.', env: {} });

  expect(answered).toStrictEqual({ exitCode: 128, stdout: '', stderr: 'fatal\n' });
  expect(ran).toStrictEqual({ exitCode: 0, stdout: 'ran git status\n', stderr: '' });
});
