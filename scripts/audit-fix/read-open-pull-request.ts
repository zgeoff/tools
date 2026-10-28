import { $ } from 'bun';

export interface OpenPullRequestQuery {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly branch: string;
}

export async function readOpenPullRequest(query: OpenPullRequestQuery): Promise<number | null> {
  const listed = await $`gh pr list --head ${query.branch} --state open --json number`
    .cwd(query.cwd)
    .env({ ...query.env })
    .text();

  const parsed: unknown = JSON.parse(listed);
  const first: unknown = Array.isArray(parsed) ? parsed[0] : undefined;

  return typeof first === 'object' &&
    first !== null &&
    'number' in first &&
    typeof first.number === 'number'
    ? first.number
    : null;
}
