import { expect, test } from 'bun:test';
import { Evaluator, Lexer, Parser, data } from '@actions/expressions';
import invariant from 'tiny-invariant';

async function setupTest() {
  const stubText = await Bun.file(new URL('repo-sync.yml', import.meta.url)).text();

  const stub: unknown = Bun.YAML.parse(stubText);

  invariant(typeof stub === 'object' && stub !== null);

  const concurrency: unknown = Reflect.get(stub, 'concurrency');

  invariant(typeof concurrency === 'object' && concurrency !== null);

  const group: unknown = Reflect.get(concurrency, 'group');

  invariant(typeof group === 'string');

  const parts = /^(?<prefix>[^$]*)\$\{\{(?<expression>[^}]*)\}\}$/u.exec(group)?.groups;

  invariant(parts?.prefix !== undefined && parts.expression !== undefined);

  const prefix = parts.prefix;

  const tree = new Parser(new Lexer(parts.expression).lex().tokens, ['github'], []).parse();

  const evaluateGroup = (context: unknown): string => {
    const github: unknown = JSON.parse(JSON.stringify(context), data.reviver);

    invariant(github instanceof data.Dictionary);

    return `${prefix}${new Evaluator(tree, github).evaluate().coerceString()}`;
  };

  return { evaluateGroup };
}

test('it gives dispatches of two tools commits two concurrency groups', async () => {
  const ctx = await setupTest();

  const first = ctx.evaluateGroup({
    github: {
      event_name: 'repository_dispatch',
      sha: '0000000000000000000000000000000000000c01',
      event: { client_payload: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1' } },
    },
  });

  const second = ctx.evaluateGroup({
    github: {
      event_name: 'repository_dispatch',
      sha: '0000000000000000000000000000000000000c01',
      event: { client_payload: { sha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2' } },
    },
  });

  expect(first).toBe('repo-sync-caller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  expect(second).toBe('repo-sync-caller-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2');
});

test.each([['schedule'], ['push'], ['workflow_dispatch']])(
  'it groups a %s run by the commit of the caller',
  async (eventName) => {
    const ctx = await setupTest();

    const group = ctx.evaluateGroup({
      github: { event_name: eventName, sha: '0000000000000000000000000000000000000c01', event: {} },
    });

    expect(group).toBe('repo-sync-caller-0000000000000000000000000000000000000c01');
  },
);
