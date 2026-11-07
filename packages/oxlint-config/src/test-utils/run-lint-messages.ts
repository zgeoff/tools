import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';
import { runOxlint } from './run-oxlint.ts';

export interface LintMessage {
  filename: string;
  line: number;
  message: string;
}

export async function runLintMessages(
  directory: string,
  rule: string,
  targets: readonly string[],
): Promise<LintMessage[]> {
  const run = await runOxlint(
    ['-c', join(directory, '.oxlintrc.json'), '--format=json', ...targets],
    directory,
  );

  return parseLintMessages(run.stdout, rule);
}

// oxlint's JSON output names a rule `plugin(rule)`, where the config names it `plugin/rule`
function parseLintMessages(stdout: string, rule: string): LintMessage[] {
  const report: unknown = JSON.parse(stdout);
  const code = `${rule.replace('/', '(')})`;
  const diagnostics: unknown = isRecord(report) ? report['diagnostics'] : null;

  if (!Array.isArray(diagnostics)) {
    throw new TypeError(`oxlint printed no diagnostics list: ${stdout}`);
  }

  // oxlint reports an exception inside a JS plugin as a diagnostic with no rule code
  const crash: unknown = diagnostics.find(
    (diagnostic: unknown) => !isRecord(diagnostic) || typeof diagnostic['code'] !== 'string',
  );

  if (crash !== undefined) {
    throw new Error(`oxlint reported a diagnostic that names no rule: ${JSON.stringify(crash)}`);
  }

  return diagnostics
    .filter((diagnostic: unknown) => isRecord(diagnostic) && diagnostic['code'] === code)
    .map((diagnostic: unknown) => toLintMessage(diagnostic))
    .toSorted(
      (left, right) => left.filename.localeCompare(right.filename) || left.line - right.line,
    );
}

function toLintMessage(diagnostic: unknown): LintMessage {
  const labels: unknown = isRecord(diagnostic) ? diagnostic['labels'] : null;
  const label: unknown = Array.isArray(labels) ? labels[0] : null;
  const span: unknown = isRecord(label) ? label['span'] : null;
  const line: unknown = isRecord(span) ? span['line'] : null;

  if (
    !isRecord(diagnostic) ||
    typeof diagnostic['filename'] !== 'string' ||
    typeof diagnostic['message'] !== 'string' ||
    typeof line !== 'number'
  ) {
    throw new TypeError(
      `oxlint printed a diagnostic of an unknown shape: ${JSON.stringify(diagnostic)}`,
    );
  }

  return { filename: diagnostic['filename'], line, message: diagnostic['message'] };
}
