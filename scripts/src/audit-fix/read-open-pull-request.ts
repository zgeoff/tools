import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';

export interface OpenPullRequestQuery {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly branch: string;
  readonly runCommand: RunCommand;
}

export async function readOpenPullRequest(query: OpenPullRequestQuery): Promise<number | null> {
  const listed = await runCheckedCommand(
    query.runCommand,
    ['gh', 'pr', 'list', '--head', query.branch, '--state', 'open', '--json', 'number'],
    { cwd: query.cwd, env: query.env },
  );

  const parsed: unknown = JSON.parse(listed.stdout);
  const first: unknown = Array.isArray(parsed) ? parsed[0] : undefined;

  return typeof first === 'object' &&
    first !== null &&
    'number' in first &&
    typeof first.number === 'number'
    ? first.number
    : null;
}
