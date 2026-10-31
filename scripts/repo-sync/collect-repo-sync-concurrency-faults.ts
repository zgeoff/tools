import { Evaluator, Lexer, Parser, data } from '@actions/expressions';
import invariant from 'tiny-invariant';

export function collectRepoSyncConcurrencyFaults(stubText: string, workflowText: string): string[] {
  return [...collectStubFaults(stubText), ...collectSyncJobFaults(workflowText)];
}

const callerCommit = '0000000000000000000000000000000000000c01';

const toolsCommits = [
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2',
] as const;

function collectStubFaults(stubText: string): string[] {
  const stub: unknown = Bun.YAML.parse(stubText);
  const group = findField(findField(stub, 'concurrency'), 'group');

  if (typeof group !== 'string') {
    return ['sync/repo-sync.yml: the workflow sets no concurrency group'];
  }

  const [first, second] = toolsCommits.map((commit) =>
    buildConcurrencyGroup(group, {
      event_name: 'repository_dispatch',
      sha: callerCommit,
      event: { client_payload: { sha: commit } },
    }),
  );

  return first === second
    ? [
        `sync/repo-sync.yml: dispatches of two tools commits share the concurrency group ${group}, so a newer dispatch replaces a pending one`,
      ]
    : [];
}

function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.entries(value).find(([name]) => name === key)?.[1];
}

function buildConcurrencyGroup(group: string, github: unknown): string {
  const context: unknown = JSON.parse(JSON.stringify({ github }), data.reviver);

  invariant(context instanceof data.Dictionary);

  return group.replaceAll(/\$\{\{(?<expression>.*?)\}\}/gu, (_part, expression: string) => {
    const tree = new Parser(new Lexer(expression).lex().tokens, ['github'], []).parse();

    return new Evaluator(tree, context).evaluate().coerceString();
  });
}

function collectSyncJobFaults(workflowText: string): string[] {
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const syncJob = findField(findField(workflow, 'jobs'), 'sync');

  return findField(findField(syncJob, 'concurrency'), 'queue') === 'max'
    ? []
    : [
        '.github/workflows/repo-sync.yml: the sync job must set queue: max, or a newer run replaces a pending one',
      ];
}
