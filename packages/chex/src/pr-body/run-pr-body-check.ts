import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { runProgram } from '../program/run-program.ts';
import { collectCheckedShas } from './collect-checked-shas.ts';
import { collectPrBodyErrors } from './collect-pr-body-errors.ts';
import { readBranchFacts } from './read-branch-facts.ts';
import { readDocPathspecs } from './read-doc-pathspecs.ts';
import { tickPrBodyChex } from './tick-pr-body-chex.ts';
import type { BranchFacts } from './types.ts';

export interface PrBodyCommandDeps {
  readonly readBody: (path: string) => string;
  readonly readFacts: (base: string, head: string, shas: readonly string[]) => BranchFacts;
  readonly writeOutput: (text: string) => void;
  readonly writeError: (text: string) => void;
}

export const prBodyUsage = `usage: chex pr-body --body-file <path> [--base <sha> --head <sha>]
       chex pr-body tick-chex --body-file <path> --passed|--failed`;

export function runPrBodyCheck(argv: readonly string[]): number {
  return runPrBodyCommand(argv, {
    readBody: (path) => readFileSync(path, 'utf8'),
    readFacts: (base, head, shas) =>
      readBranchFacts({
        cwd: process.cwd(),
        env: process.env,
        runProgram,
        pathspecs: readDocPathspecs(),
        base,
        head,
        shas,
      }),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}

// Returns the exit code: 0 when the body passes, 1 with errors, and 2 when the check cannot run.
export function runPrBodyCommand(argv: readonly string[], deps: PrBodyCommandDeps): number {
  try {
    return runParsedCommand(argv, deps);
  } catch (error) {
    deps.writeError(`pr-body: ${error instanceof Error ? error.message : String(error)}\n`);

    return 2;
  }
}

function runParsedCommand(argv: readonly string[], deps: PrBodyCommandDeps): number {
  const parsed = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      'body-file': { type: 'string' },
      base: { type: 'string' },
      head: { type: 'string' },
      passed: { type: 'boolean' },
      failed: { type: 'boolean' },
    },
  });

  const values = parsed.values;
  const bodyFile = values['body-file'];
  const [subcommand, ...extra] = parsed.positionals;

  if (
    bodyFile === undefined ||
    extra.length > 0 ||
    (subcommand !== undefined && subcommand !== 'tick-chex')
  ) {
    deps.writeError(
      `pr-body: name --body-file, and at most the subcommand tick-chex\n${prBodyUsage}\n`,
    );

    return 2;
  }

  const body = deps.readBody(bodyFile);

  if (subcommand === 'tick-chex') {
    if (values.passed === values.failed) {
      deps.writeError(
        `pr-body: tick-chex takes --passed or --failed, not both or neither\n${prBodyUsage}\n`,
      );

      return 2;
    }

    deps.writeOutput(tickPrBodyChex(body, values.passed === true));

    return 0;
  }

  if ((values.base === undefined) !== (values.head === undefined)) {
    deps.writeError(`pr-body: --base and --head go together\n${prBodyUsage}\n`);

    return 2;
  }

  const facts =
    values.base === undefined || values.head === undefined
      ? undefined
      : deps.readFacts(values.base, values.head, collectCheckedShas(body));

  const errors = collectPrBodyErrors(body, facts);

  if (errors.length > 0) {
    deps.writeOutput(`${errors.map((error) => `pr-body: ${error}`).join('\n')}\n`);
  }

  return errors.length === 0 ? 0 : 1;
}
