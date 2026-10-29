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

  // Set while auto-merge is on, with the head commit it was turned on for.
  readonly autoMerge?: { readonly method: 'squash'; readonly head: string };
}

const [statePath = '', ...commandLine] = process.argv.slice(2);
const parsed = parseCommandLine(commandLine) ?? exitWithUsage();

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

if (group === 'api') {
  await runGraphQL();
} else if (group !== 'pr') {
  exitWithUsage();
} else if (command === 'list' && rest.length === 0 && flagNames === 'head jq json state') {
  if (
    flags.state !== 'open' ||
    (flags.json !== 'number' && flags.json !== 'number,autoMergeRequest')
  ) {
    exitWithUsage();
  }

  const open = pulls
    .filter((pull) => pull.head === flags.head)
    .map((pull) =>
      flags.json === 'number'
        ? { number: pull.number }
        : {
            number: pull.number,
            autoMergeRequest: pull.autoMerge === undefined ? null : { mergeMethod: 'SQUASH' },
          },
    );

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
} else if (command === 'view' && rest.length === 1 && flagNames === 'jq json') {
  const pull = pulls.find((candidate) => candidate.number === Number(rest[0]));

  if (pull === undefined || flags.json !== 'id,baseRefName') {
    exitWithUsage();
  }

  const viewed =
    await $`jq -r ${flags.jq ?? ''} < ${Response.json({ id: `PR_${pull.number}`, baseRefName: pull.base })}`.text();

  process.stdout.write(viewed);
} else if (command === 'merge' && rest.length === 1 && flagNames === 'disable-auto') {
  const index = pulls.findIndex((pull) => pull.number === Number(rest[0]));
  const pull = pulls[index];

  if (pull === undefined) {
    process.stderr.write(`no open pull request #${rest[0]}\n`);
    process.exit(1);
  }

  const { autoMerge: _autoMerge, ...withoutAutoMerge } = pull;

  pulls[index] = withoutAutoMerge;

  await writeFile(statePath, `${JSON.stringify(pulls, null, 2)}\n`);
} else {
  exitWithUsage();
}

// Runs the enablePullRequestAutoMerge mutation, the one GraphQL call the stub answers.
async function runGraphQL(): Promise<void> {
  const fields = new Map(
    (flags.field ?? []).map((field) => [
      field.slice(0, field.indexOf('=')),
      field.slice(field.indexOf('=') + 1),
    ]),
  );

  const query = fields.get('query') ?? '';
  const index = pulls.findIndex((pull) => `PR_${pull.number}` === fields.get('pullRequestID'));
  const pull = pulls[index];

  if (
    command !== 'graphql' ||
    flagNames !== 'field' ||
    !query.includes('enablePullRequestAutoMerge') ||
    pull === undefined
  ) {
    exitWithUsage();
  }

  // A test sets this to stand for a repo that refuses auto-merge.
  const refusal = process.env['STUB_GH_AUTO_MERGE_REFUSAL'] ?? '';

  if (refusal !== '') {
    process.stderr.write(`${refusal}\n`);
    process.exit(1);
  }

  pulls[index] = { ...pull, autoMerge: { method: 'squash', head: fields.get('head') ?? '' } };

  await writeFile(statePath, `${JSON.stringify(pulls, null, 2)}\n`);

  process.stdout.write('{"data":{"enablePullRequestAutoMerge":{"clientMutationId":null}}}\n');
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
        'disable-auto': { type: 'boolean' },
        head: { type: 'string' },
        jq: { type: 'string' },
        field: { type: 'string', short: 'f', multiple: true },
        json: { type: 'string' },
        state: { type: 'string' },
        title: { type: 'string' },
      },
    });
  } catch {
    return null;
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
    value.state === 'open' &&
    (!('autoMerge' in value) || isStubAutoMerge(value.autoMerge))
  );
}

function isStubAutoMerge(value: unknown): value is StubPullRequest['autoMerge'] {
  return (
    typeof value === 'object' &&
    value !== null &&
    'method' in value &&
    value.method === 'squash' &&
    'head' in value &&
    typeof value.head === 'string'
  );
}

function exitWithUsage(): never {
  process.stderr.write(
    'stub gh: supports only: gh pr list|create|edit|view|merge and gh api graphql, as run-stub-pull-request-gh.ts lists\n',
  );

  process.exit(64);
}
