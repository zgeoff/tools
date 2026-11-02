import { expect, test } from 'bun:test';
import { buildStubCommandRunner } from './build-stub-command-runner.ts';

test('it resolves a command answered with null, and records the call', async () => {
  const stub = buildStubCommandRunner({ 'kettle boil': null });

  await stub.runCommand(['kettle', 'boil'], '/galley');

  expect(stub.calls).toStrictEqual([{ command: ['kettle', 'boil'], cwd: '/galley' }]);
});

test('it rejects a command answered with a message', () => {
  const stub = buildStubCommandRunner({ 'kettle boil': 'kettle exited 1' });

  expect(stub.runCommand(['kettle', 'boil'], '/galley')).rejects.toThrow('kettle exited 1');
});

test('it fails on a command the test gave no answer for', () => {
  const stub = buildStubCommandRunner({});

  expect(() => stub.runCommand(['kettle', 'boil'], '/galley')).toThrow(
    'the stub command runner has no answer for kettle boil',
  );
});
