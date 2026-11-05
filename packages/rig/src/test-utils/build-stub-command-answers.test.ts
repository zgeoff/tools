import { expect, test } from 'bun:test';
import { buildStubCommandAnswers } from './build-stub-command-answers.ts';

test('it answers each run with the next exit code, and 0 past the last, recording each call', async () => {
  const stub = buildStubCommandAnswers({ exitCodes: [3, 1], outputs: {} });
  const options = { cwd: '/galley', environment: {}, signal: new AbortController().signal };

  const exitCodes = [
    await stub.runCommand(['kettle', 'boil'], options),
    await stub.runCommand(['kettle', 'pour'], options),
    await stub.runCommand(['kettle', 'rinse'], options),
  ];

  expect({ exitCodes, commands: stub.runCommand.mock.calls.map((call) => call[0]) }).toStrictEqual({
    exitCodes: [3, 1, 0],
    commands: [
      ['kettle', 'boil'],
      ['kettle', 'pour'],
      ['kettle', 'rinse'],
    ],
  });
});

test('it aborts the controller before it gives an aborting exit code', async () => {
  const controller = new AbortController();

  const stub = buildStubCommandAnswers({
    exitCodes: [{ exitCode: 1, abort: controller }],
    outputs: {},
  });

  const exitCode = await stub.runCommand(['kettle', 'boil'], {
    cwd: '/galley',
    environment: {},
    signal: controller.signal,
  });

  expect({ exitCode, isAborted: controller.signal.aborted }).toStrictEqual({
    exitCode: 1,
    isAborted: true,
  });
});

test('it answers a read with the output listed for its command', () => {
  const stub = buildStubCommandAnswers({
    exitCodes: [],
    outputs: { 'kettle --level': { exitCode: 0, stdout: 'full\n' } },
  });

  expect(
    stub.readCommandOutput(['kettle', '--level'], { cwd: '/galley', environment: {} }),
  ).resolves.toStrictEqual({ exitCode: 0, stdout: 'full\n' });
});

test('it answers a read of a command with no listed output with exit code 127', () => {
  const stub = buildStubCommandAnswers({ exitCodes: [], outputs: {} });

  expect(
    stub.readCommandOutput(['kettle', '--level'], { cwd: '/galley', environment: {} }),
  ).resolves.toStrictEqual({ exitCode: 127, stdout: '' });
});
