import { constants } from 'node:os';

// The exit code of a program, which is 128 plus the signal's number when a signal killed it.
export function toExitCode(
  exitCode: number,
  signal: number | NodeJS.Signals | string | null | undefined,
): number {
  if (signal === null || signal === undefined || signal === 0) {
    return exitCode;
  }

  if (typeof signal === 'number') {
    return 128 + signal;
  }

  const number = Object.entries(constants.signals).find(([name]) => name === signal)?.[1];

  return number === undefined ? exitCode : 128 + number;
}
