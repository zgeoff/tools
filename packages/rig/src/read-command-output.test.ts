import { expect, test } from 'bun:test';
import { processRuntime } from './browser/process-runtime.ts';
import { readCommandOutput } from './read-command-output.ts';

test('it returns the exit code and stdout of the command', () => {
  expect(
    readCommandOutput(
      ['printf', String.raw`kettle\n`],
      { cwd: import.meta.dir, environment: process.env },
      processRuntime,
    ),
  ).resolves.toStrictEqual({
    exitCode: 0,
    stdout: 'kettle\n',
  });
});

test('it returns a non-zero exit code of the command', () => {
  expect(
    readCommandOutput(
      ['sh', '-c', 'printf teapot; exit 3'],
      { cwd: import.meta.dir, environment: process.env },
      processRuntime,
    ),
  ).resolves.toStrictEqual({ exitCode: 3, stdout: 'teapot' });
});

test('it runs the command in the folder it is given', () => {
  expect(
    readCommandOutput(['pwd'], { cwd: import.meta.dir, environment: process.env }, processRuntime),
  ).resolves.toStrictEqual({
    exitCode: 0,
    stdout: `${import.meta.dir}\n`,
  });
});

test('it runs the command with the environment it is given', () => {
  expect(
    readCommandOutput(
      ['sh', '-c', 'printf "$KETTLE_SPOUT"'],
      { cwd: import.meta.dir, environment: { ...process.env, KETTLE_SPOUT: 'copper' } },
      processRuntime,
    ),
  ).resolves.toStrictEqual({ exitCode: 0, stdout: 'copper' });
});
