import { expect, test } from 'bun:test';
import { runCommand } from '../scripts/ci/run-command.ts';
import { makeOutputRecordingRunner } from './make-output-recording-runner.ts';

test('it returns each result of the runner it wraps and records what each command printed', async () => {
  const recording = makeOutputRecordingRunner(runCommand);

  const first = await recording.runCommand(['sh', '-c', 'echo boil; echo hiss >&2'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
  });

  const second = await recording.runCommand(['sh', '-c', 'exit 3'], {
    cwd: import.meta.dir,
    env: { PATH: process.env['PATH'] },
  });

  expect({
    first: first.exitCode,
    second: second.exitCode,
    outputs: recording.outputs,
  }).toStrictEqual({ first: 0, second: 3, outputs: ['boil\nhiss\n', ''] });
});
