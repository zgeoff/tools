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

const state: unknown = JSON.parse(stateText);

if (!isStubPullRequestList(state)) {
  process.stderr.write(`stub gh: ${statePath} holds no list of pull requests\n`);
  process.exit(1);
}

const pulls = state;
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

function isStubPullRequestList(value: unknown): value is StubPullRequest[] {
  return Array.isArray(value) && value.every((pull) => isStubPullRequest(pull));
}

function isStubPullRequest(value: unknown): value is StubPullRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'number' in value &&
    typeof value.number === 'number' &&
    'base' in value &&
    typeof value.base === 'string' &&
    'head' in value &&
    typeof value.head === 'string' &&
    'title' in value &&
    typeof value.title === 'string' &&
    'body' in value &&
    typeof value.body === 'string' &&
    'state' in value &&
    value.state === 'open'
  );
}

function exitWithUsage(): never {
  process.stderr.write('stub gh: supports only: gh pr list|create|edit, as run-stub-gh.ts lists\n');
  process.exit(64);
}
