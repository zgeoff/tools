import { expect, test } from 'bun:test';
import { readCommandOutput } from './read-command-output.ts';

test('it returns the exit code and stdout of the command', () => {
  expect(
    readCommandOutput(['printf', String.raw`kettle\n`], import.meta.dir),
  ).resolves.toStrictEqual({
    exitCode: 0,
    stdout: 'kettle\n',
  });
});

test('it returns a non-zero exit code of the command', () => {
  expect(
    readCommandOutput(['sh', '-c', 'printf teapot; exit 3'], import.meta.dir),
  ).resolves.toStrictEqual({ exitCode: 3, stdout: 'teapot' });
});

test('it runs the command in the folder it is given', () => {
  expect(readCommandOutput(['pwd'], import.meta.dir)).resolves.toStrictEqual({
    exitCode: 0,
    stdout: `${import.meta.dir}\n`,
  });
});
