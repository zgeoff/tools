// A check needs a program that the PATH lacks. The runner prints the message and exits 2.
export class MissingProgramError extends Error {
  readonly program: string;

  constructor(check: string, program: string) {
    super(
      `${check}: ${program} is not on the PATH, and the ${check} check needs it. Install ${program}, then run zgeoff-check again.`,
    );

    this.name = 'MissingProgramError';
    this.program = program;
  }
}
