import type { CommandResult, RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';

export interface WriteSyncDispatchesOptions {
  readonly cwd: string;

  // The whole environment of each gh command; GH_TOKEN holds the sync App's installation token.
  readonly env: Readonly<Record<string, string | undefined>>;

  // The commit of zgeoff/tools that each repo syncs from.
  readonly commit: string;

  // The owner and name of this repository, which takes no dispatch.
  readonly repo: string;

  readonly runCommand: RunCommand;

  // Receives the step's log.
  readonly writeOutput: (text: string) => void;
}

const syncDispatchEvent = 'zgeoff-tools-sync';

// One repo that refuses the dispatch fails the step after the others get theirs.
export async function writeSyncDispatches(
  options: Readonly<WriteSyncDispatchesOptions>,
): Promise<number> {
  if (!/^[0-9a-f]{40}$/u.test(options.commit)) {
    options.writeOutput(`::error::'${options.commit}' is not a full commit ID\n`);

    return 1;
  }

  const listed = await runGH(options, [
    'gh',
    'api',
    '--paginate',
    'installation/repositories',
    '--jq',
    '.repositories[] | select(.archived | not) | .full_name',
  ]);

  if (listed.exitCode !== 0) {
    options.writeOutput(`::error::Cannot list the sync App's repos: ${listed.stderr.trim()}\n`);

    return 1;
  }

  const repos = listed.stdout
    .split('\n')
    .filter((repo) => repo !== '' && repo !== options.repo)
    .toSorted();

  const failed: string[] = [];

  for (const repo of repos) {
    const sent = await runGH(options, [
      'gh',
      'api',
      '--silent',
      `repos/${repo}/dispatches`,
      '-f',
      `event_type=${syncDispatchEvent}`,
      '-f',
      `client_payload[sha]=${options.commit}`,
    ]);

    if (sent.exitCode === 0) {
      options.writeOutput(`Dispatched ${options.commit} to ${repo}.\n`);
    } else {
      options.writeOutput(`::error::${repo} refused the dispatch: ${sent.stderr.trim()}\n`);
      failed.push(repo);
    }
  }

  return failed.length === 0 ? 0 : 1;
}

function runGH(
  options: Readonly<WriteSyncDispatchesOptions>,
  argv: readonly string[],
): Promise<CommandResult> {
  return options.runCommand(argv, { cwd: options.cwd, env: options.env });
}

if (import.meta.main) {
  process.exitCode = await writeSyncDispatches({
    cwd: process.cwd(),
    env: process.env,
    commit: process.env['COMMIT'] ?? '',
    repo: process.env['REPO'] ?? '',
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
