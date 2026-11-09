import { runCheckedCommand } from '../ci/run-checked-command.ts';
import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';
import { parseSyncPullRequests } from './parse-sync-pull-requests.ts';
import { pickSyncAlarm } from './pick-sync-alarm.ts';

export interface WriteSyncAlarmOptions {
  readonly cwd: string;

  // The whole environment of each gh command, as the step's env holds it.
  readonly env: Readonly<Record<string, string | undefined>>;

  // The sync branch whose open pull request the alarm watches.
  readonly branch: string;

  readonly now: Date;
  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

export async function writeSyncAlarm(options: Readonly<WriteSyncAlarmOptions>): Promise<number> {
  const listed = await runAlarmCommand(options, [
    'gh',
    'pr',
    'list',
    '--head',
    options.branch,
    '--state',
    'open',
    '--json',
    'number,url,createdAt,statusCheckRollup',
  ]);

  const listedValue: unknown = JSON.parse(listed.stdout);
  const pullRequests = parseSyncPullRequests(listedValue);

  if (pullRequests === null) {
    options.writeOutput('::error::gh pr list printed no list of pull requests\n');

    return 1;
  }

  const issues = await runAlarmCommand(options, [
    'gh',
    'issue',
    'list',
    '--state',
    'open',
    '--limit',
    '1000',
    '--json',
    'title',
    '--jq',
    '.[].title',
  ]);

  const alarm = pickSyncAlarm({
    pullRequests,
    issueTitles: issues.stdout.split('\n'),
    now: options.now,
  });

  if (alarm.kind === 'quiet') {
    options.writeOutput('No new sync pull request is red for more than a day.\n');

    return 0;
  }

  const created = await runAlarmCommand(options, [
    'gh',
    'issue',
    'create',
    '--title',
    alarm.title,
    '--body',
    alarm.body,
  ]);

  options.writeOutput(`::warning::Opened ${created.stdout.trim()}: ${alarm.title}\n`);

  return 0;
}

function runAlarmCommand(
  options: Readonly<WriteSyncAlarmOptions>,
  argv: readonly string[],
): Promise<CommandResult> {
  return runCheckedCommand(options.runCommand, argv, { cwd: options.cwd, env: options.env });
}

if (import.meta.main) {
  process.exitCode = await writeSyncAlarm({
    cwd: process.cwd(),
    env: process.env,
    branch: process.env['BRANCH'] ?? '',
    now: new Date(),
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
