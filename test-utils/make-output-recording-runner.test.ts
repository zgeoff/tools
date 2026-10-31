import { expect, test } from 'bun:test';
import type { CommandResult } from '../scripts/ci/run-command.ts';
import { makeOutputRecordingRunner } from './make-output-recording-runner.ts';

test('it returns each result of the runner it wraps and records what each command printed', async () => {
  const results: Readonly<Record<string, CommandResult>> = {
    boil: { exitCode: 0, stdout: 'boil\n', stderr: 'hiss\n' },
    spill: { exitCode: 3, stdout: '', stderr: '' },
  };

  const recording = makeOutputRecordingRunner((argv) =>
    Promise.resolve(results[argv[0] ?? ''] ?? { exitCode: 127, stdout: '', stderr: 'unknown\n' }),
  );

  const first = await recording.runCommand(['boil'], { cwd: '/srv/kettle', env: {} });
  const second = await recording.runCommand(['spill'], { cwd: '/srv/kettle', env: {} });

  expect(first).toStrictEqual({ exitCode: 0, stdout: 'boil\n', stderr: 'hiss\n' });
  expect(second).toStrictEqual({ exitCode: 3, stdout: '', stderr: '' });
  expect(recording.outputs).toStrictEqual(['boil\nhiss\n', '']);
});
