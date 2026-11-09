import { expect, test } from 'bun:test';
import { Evaluator, Lexer, Parser, data } from '@actions/expressions';
import invariant from 'tiny-invariant';

async function setupTest() {
  const callerText = await Bun.file(new URL('audit-fix.yml', import.meta.url)).text();

  const caller: unknown = Bun.YAML.parse(callerText);

  invariant(typeof caller === 'object' && caller !== null);

  const jobs: unknown = Reflect.get(caller, 'jobs');

  invariant(typeof jobs === 'object' && jobs !== null);

  const job: unknown = Reflect.get(jobs, 'audit-fix');

  invariant(typeof job === 'object' && job !== null);

  const condition: unknown = Reflect.get(job, 'if');

  invariant(typeof condition === 'string');

  const tree = new Parser(new Lexer(condition).lex().tokens, ['github'], []).parse();

  return { tree };
}

test.each([
  ['a failed push run', 'push'],
  ['a failed scheduled run', 'schedule'],
  ['a failed dispatched run', 'workflow_dispatch'],
])('it starts the audit-fix job after %s from the caller on main', async (_label, event) => {
  const ctx = await setupTest();

  const github: unknown = JSON.parse(
    JSON.stringify({
      github: {
        event_name: 'workflow_run',
        repository: 'zgeoff/example',
        event: {
          workflow_run: {
            event,
            conclusion: 'failure',
            head_branch: 'main',
            head_repository: { full_name: 'zgeoff/example' },
          },
        },
      },
    }),
    data.reviver,
  );

  invariant(github instanceof data.Dictionary);

  expect(new Evaluator(ctx.tree, github).evaluate()).toStrictEqual(new data.BooleanData(true));
});

test.each([
  ['a passed push run from the caller', 'push', 'success', 'zgeoff/example'],
  ['a failed pull request run from the caller', 'pull_request', 'failure', 'zgeoff/example'],
  ['a failed pull request run from a fork', 'pull_request', 'failure', 'someone/example'],
  ['a failed pull_request_target run', 'pull_request_target', 'failure', 'zgeoff/example'],
  ['a failed push run whose head repository is a fork', 'push', 'failure', 'someone/example'],
])(
  'it starts no audit-fix job after %s on a branch named main',
  async (_label, event, conclusion, headRepository) => {
    const ctx = await setupTest();

    const github: unknown = JSON.parse(
      JSON.stringify({
        github: {
          event_name: 'workflow_run',
          repository: 'zgeoff/example',
          event: {
            workflow_run: {
              event,
              conclusion,
              head_branch: 'main',
              head_repository: { full_name: headRepository },
            },
          },
        },
      }),
      data.reviver,
    );

    invariant(github instanceof data.Dictionary);

    expect(new Evaluator(ctx.tree, github).evaluate()).toStrictEqual(new data.BooleanData(false));
  },
);

test.each([['schedule'], ['workflow_dispatch']])(
  'it starts the audit-fix job on its own %s event',
  async (eventName) => {
    const ctx = await setupTest();

    const github: unknown = JSON.parse(
      JSON.stringify({
        github: { event_name: eventName, repository: 'zgeoff/example', event: {} },
      }),
      data.reviver,
    );

    invariant(github instanceof data.Dictionary);

    expect(new Evaluator(ctx.tree, github).evaluate()).toStrictEqual(new data.BooleanData(true));
  },
);
