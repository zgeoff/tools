import { expect, test } from 'bun:test';
import { buildStubProgramRunner } from './build-stub-program-runner.ts';

test('it answers each command by its argv', () => {
  const runProgram = buildStubProgramRunner({
    'bun audit --json': { exitCode: 1, stdout: '{"left-pad":[]}', stderr: '' },
  });

  expect(runProgram(['bun', 'audit', '--json'], { cwd: '/repo', env: {} })).toStrictEqual({
    exitCode: 1,
    stdout: '{"left-pad":[]}',
    stderr: '',
  });
});

test('it fails on a command the test gave no answer for', () => {
  const runProgram = buildStubProgramRunner({});

  expect(() => runProgram(['bun', 'audit'], { cwd: '/repo', env: {} })).toThrow(
    'the stub program runner has no answer for bun audit',
  );
});
