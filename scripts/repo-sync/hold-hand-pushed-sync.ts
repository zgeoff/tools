import { isRecord } from '../../packages/std/src/is-record.ts';
import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import type { SyncPullRequest } from './build-hand-pushed-sync-plan.ts';
import { buildHandPushedSyncPlan } from './build-hand-pushed-sync-plan.ts';

export interface HoldHandPushedSyncOptions {
  readonly cwd: string;

  // The whole environment of each command, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

// The sync job binds auto-merge to the head it pushed, and GitHub keeps auto-merge on through a
// later push by any user with write access. A push by anyone but the pull request's author turns it
// off here, so the pull request waits for review.
export async function holdHandPushedSync(
  options: Readonly<HoldHandPushedSyncOptions>,
): Promise<number> {
  const repo = options.env['REPO'] ?? '';
  const branch = options.env['BRANCH'] ?? '';
  const pusher = options.env['PUSHER'] ?? '';
  const owner = repo.slice(0, repo.indexOf('/'));
  const commandOptions = { cwd: options.cwd, env: options.env };

  const listed = await runCheckedCommand(
    options.runCommand,
    ['gh', 'api', `repos/${repo}/pulls?state=open&head=${owner}:${branch}`],
    commandOptions,
  );

  const pullsValue: unknown = JSON.parse(listed.stdout);
  const pullRequests = parseSyncPullRequests(pullsValue);
  const plan = buildHandPushedSyncPlan({ branch, pusher, pullRequests });

  for (const number of plan.turnOff) {
    await runCheckedCommand(
      options.runCommand,
      ['gh', 'pr', 'merge', String(number), '--disable-auto', '--repo', repo],
      commandOptions,
    );
  }

  options.writeOutput(plan.messages.join(''));

  return 0;
}

function parseSyncPullRequests(value: unknown): SyncPullRequest[] {
  if (!Array.isArray(value)) {
    throw new TypeError('gh api returned no list of pull requests');
  }

  return value.map((pull: unknown) => parseSyncPullRequest(pull));
}

function parseSyncPullRequest(pull: unknown): SyncPullRequest {
  const user = isRecord(pull) ? pull['user'] : undefined;

  if (
    !isRecord(pull) ||
    typeof pull['number'] !== 'number' ||
    !isRecord(user) ||
    typeof user['login'] !== 'string'
  ) {
    throw new TypeError('gh api returned a pull request with no number or author');
  }

  return {
    number: pull['number'],
    author: user['login'],
    isAutoMergeOn: pull['auto_merge'] !== null && pull['auto_merge'] !== undefined,
  };
}

if (import.meta.main) {
  process.exitCode = await holdHandPushedSync({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
