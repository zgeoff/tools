import { expect, test } from 'bun:test';
import { toExitCode } from './to-exit-code.ts';

test('it keeps the exit code when no signal ended the program', () => {
  expect(toExitCode(3, null)).toBe(3);
  expect(toExitCode(3, undefined)).toBe(3);
  expect(toExitCode(3, 0)).toBe(3);
});

test('it adds 128 to a signal number', () => {
  expect(toExitCode(0, 15)).toBe(143);
});

test('it adds 128 to the number of a signal name', () => {
  expect(toExitCode(0, 'SIGKILL')).toBe(137);
});

test('it keeps the exit code for a name that is no signal', () => {
  expect(toExitCode(5, 'SIGNOPE')).toBe(5);
});
