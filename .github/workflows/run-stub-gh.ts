// A stand-in for the gh pull-request commands of one repository, which create-stub-gh.ts installs
// as gh. The first argument is the state file, a JSON array of pull requests; the rest is the gh
// command line. A command line outside `pr list`, `pr create` and `pr edit` exits 64.
import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { $ } from 'bun';

interface StubPullRequest {
  readonly number: number;
  readonly base: string;
  readonly head: string;
  readonly title: string;
  readonly body: string;
  readonly state: 'open';
}

const [statePath = '', ...commandLine] = process.argv.slice(2);
const parsed = parseCommandLine(commandLine);

const stateText = await readFile(statePath, 'utf8');

const pulls: StubPullRequest[] = JSON.parse(stateText);
const [group, command, ...rest] = parsed.positionals;
const flags = parsed.values;
const flagNames = Object.keys(flags).toSorted().join(' ');

if (group !== 'pr') {
  exitWithUsage();
}

if (command === 'list' && rest.length === 0 && flagNames === 'head jq json state') {
  if (flags.state !== 'open' || flags.json !== 'number') {
    exitWithUsage();
  }

  const open = pulls
    .filter((pull) => pull.head === flags.head)
    .map((pull) => ({ number: pull.number }));

  const listed = await $`jq -r ${flags.jq ?? ''} < ${Response.json(open)}`.text();

  process.stdout.write(listed);
} else if (command === 'create' && rest.length === 0 && flagNames === 'base body head title') {
  if (pulls.some((pull) => pull.head === flags.head)) {
    process.stderr.write(
      `a pull request for branch "${flags.head}" into branch "${flags.base}" already exists\n`,
    );

    process.exit(1);
  }

  const number = pulls.length + 1;

  pulls.push({
    number,
    base: flags.base ?? '',
    head: flags.head ?? '',
    title: flags.title ?? '',
    body: flags.body ?? '',
    state: 'open',
  });

  await writeFile(statePath, `${JSON.stringify(pulls, null, 2)}\n`);

  process.stdout.write(`https://github.com/example/repo/pull/${number}\n`);
} else if (command === 'edit' && rest.length === 1 && flagNames === 'body title') {
  const number = Number(rest[0]);
  const index = pulls.findIndex((pull) => pull.number === number);
  const pull = pulls[index];

  if (pull === undefined) {
    process.stderr.write(`no open pull request #${rest[0]}\n`);
    process.exit(1);
  }

  pulls[index] = { ...pull, title: flags.title ?? '', body: flags.body ?? '' };

  await writeFile(statePath, `${JSON.stringify(pulls, null, 2)}\n`);

  process.stdout.write(`https://github.com/example/repo/pull/${number}\n`);
} else {
  exitWithUsage();
}

function parseCommandLine(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        base: { type: 'string' },
        body: { type: 'string' },
        head: { type: 'string' },
        jq: { type: 'string' },
        json: { type: 'string' },
        state: { type: 'string' },
        title: { type: 'string' },
      },
    });
  } catch {
    return exitWithUsage();
  }
}

function exitWithUsage(): never {
  process.stderr.write('stub gh: supports only: gh pr list|create|edit, as run-stub-gh.ts lists\n');
  process.exit(64);
}
