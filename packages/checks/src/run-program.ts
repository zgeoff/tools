import { MissingProgramError } from './missing-program-error.ts';
import type { CheckContext } from './types.ts';

export interface ProgramResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// Runs a program that a check needs, found on the context's PATH, with `stdin` as its input when
// given. A program the PATH lacks throws MissingProgramError, so the runner can name it instead of
// printing a spawn error.
export function runProgram(
  check: string,
  context: Pick<CheckContext, 'cwd' | 'env'>,
  argv: readonly [string, ...string[]],
  stdin?: string,
): ProgramResult {
  const [program] = argv;

  if (Bun.which(program, { PATH: context.env['PATH'] ?? '' }) === null) {
    throw new MissingProgramError(check, program);
  }

  const result = Bun.spawnSync([...argv], {
    cwd: context.cwd,
    env: { ...context.env },
    stdin: stdin === undefined ? 'ignore' : Buffer.from(stdin),
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}
