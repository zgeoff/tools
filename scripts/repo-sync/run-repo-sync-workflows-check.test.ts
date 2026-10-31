import { expect, test } from 'bun:test';
import { runRepoSyncWorkflowsCheck } from './run-repo-sync-workflows-check.ts';

test('it prints nothing and returns 0 for workflows that run every dispatch', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runRepoSyncWorkflowsCheck({
    readStub: () =>
      Promise.resolve(
        [
          'concurrency:',
          `  group: bakery-sync-\${{ github.event.client_payload.sha || github.sha }}`,
          'jobs:',
          '  sync:',
          '    permissions:',
          '      actions: read',
          '',
        ].join('\n'),
      ),
    readWorkflow: () =>
      Promise.resolve(
        [
          'jobs:',
          '  sync:',
          '    concurrency:',
          '      queue: max',
          '  alarm:',
          '    permissions:',
          '      actions: read',
          '',
        ].join('\n'),
      ),
    writeOutput: (line) => {
      output.push(line);
    },
    writeError: (line) => {
      errors.push(line);
    },
  });

  expect(exitCode).toBe(0);
  expect(output).toBeEmpty();
  expect(errors).toBeEmpty();
});

test('it prints each fault of the repo-sync workflows and returns 1', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runRepoSyncWorkflowsCheck({
    readStub: () => Promise.resolve(['name: Bakery sync', ''].join('\n')),
    readWorkflow: () => Promise.resolve(['jobs:', '  sync:', '    name: Sync', ''].join('\n')),
    writeOutput: (line) => {
      output.push(line);
    },
    writeError: (line) => {
      errors.push(line);
    },
  });

  expect(exitCode).toBe(1);

  expect(output).toStrictEqual([
    'sync/repo-sync.yml: the workflow sets no concurrency group\n',
    '.github/workflows/repo-sync.yml: the sync job must set queue: max, or a newer run replaces a pending one\n',
    '.github/workflows/repo-sync.yml: the alarm job must ask for actions: read, or it cannot read the checks of a private repo\n',
  ]);

  expect(errors).toBeEmpty();
});

test('it returns 2 with the cause when a workflow cannot be read', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runRepoSyncWorkflowsCheck({
    readStub: () => Promise.reject(new Error('ENOENT: no such file, open sync/repo-sync.yml')),
    readWorkflow: () => Promise.resolve(''),
    writeOutput: (line) => {
      output.push(line);
    },
    writeError: (line) => {
      errors.push(line);
    },
  });

  expect(exitCode).toBe(2);
  expect(output).toBeEmpty();

  expect(errors).toStrictEqual([
    'repo-sync-workflows: ENOENT: no such file, open sync/repo-sync.yml\n',
  ]);
});

test('it returns 2 with the cause when a group holds an expression GitHub cannot parse', async () => {
  const output: string[] = [];
  const errors: string[] = [];

  const exitCode = await runRepoSyncWorkflowsCheck({
    readStub: () =>
      Promise.resolve(
        ['concurrency:', `  group: bakery-sync-\${{ github.sha || }}`, ''].join('\n'),
      ),
    readWorkflow: () => Promise.resolve(''),
    writeOutput: (line) => {
      output.push(line);
    },
    writeError: (line) => {
      errors.push(line);
    },
  });

  expect(exitCode).toBe(2);
  expect(output).toBeEmpty();
  expect(errors).toStrictEqual(["repo-sync-workflows: Unexpected end of expression: '||'\n"]);
});
