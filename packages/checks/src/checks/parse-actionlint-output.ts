import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// Turns one `actionlint -format '{{json .}}'` run into findings, one per reported error. A run that
// did not check every file throws instead, so the caller never reads it as a clean result.
export function parseActionlintOutput(result: ProgramResult): Finding[] {
  // actionlint exits 1 when it reports an error, 2 on a bad option, and 3 when it cannot run.
  if (result.exitCode > 1) {
    throw new Error(`workflows: actionlint failed: ${result.stderr.trim()}`);
  }

  const errors = parseErrors(result);

  // An exit of 1 with no error it could read is a crash, not a clean run.
  if (result.exitCode === 1 && errors.length === 0) {
    throw new Error(`workflows: actionlint failed: ${result.stderr.trim()}`);
  }

  return errors.map((error) => ({
    path: error.filepath,
    line: error.line,
    message: `actionlint: ${error.message} [${error.kind}]`,
  }));
}

interface ActionlintError {
  readonly filepath: string;
  readonly line: number;
  readonly message: string;
  readonly kind: string;
}

function parseErrors(result: ProgramResult): ActionlintError[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `workflows: actionlint printed output that is not JSON: ${result.stdout.trim()}`,
    );
  }

  if (!Array.isArray(parsed) || !parsed.every((entry) => isActionlintError(entry))) {
    throw new Error(`workflows: actionlint printed an unknown shape: ${result.stdout.trim()}`);
  }

  return parsed;
}

function isActionlintError(entry: unknown): entry is ActionlintError {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'filepath' in entry &&
    typeof entry.filepath === 'string' &&
    'line' in entry &&
    typeof entry.line === 'number' &&
    'message' in entry &&
    typeof entry.message === 'string' &&
    'kind' in entry &&
    typeof entry.kind === 'string'
  );
}
