import { expect, test } from 'bun:test';
import { collectRepoSyncConcurrencyFaults } from './collect-repo-sync-concurrency-faults.ts';

test('it reports nothing for a stub keyed on the dispatched commit and a queued sync job', () => {
  const stubText = [
    'concurrency:',
    `  group: bakery-sync-\${{ github.event.client_payload.sha || github.sha }}`,
    '  cancel-in-progress: false',
    '',
  ].join('\n');

  const workflowText = [
    'jobs:',
    '  sync:',
    '    concurrency:',
    `      group: bakery-sync-\${{ github.repository }}`,
    '      queue: max',
    '',
  ].join('\n');

  const faults = collectRepoSyncConcurrencyFaults(stubText, workflowText);

  expect(faults).toBeEmpty();
});

test('it reports a stub whose group gives dispatches of two tools commits one group', () => {
  const stubText = [
    'concurrency:',
    `  group: bakery-sync-\${{ github.sha }}`,
    '  cancel-in-progress: false',
    '',
  ].join('\n');

  const workflowText = ['jobs:', '  sync:', '    concurrency:', '      queue: max', ''].join('\n');
  const faults = collectRepoSyncConcurrencyFaults(stubText, workflowText);

  expect(faults).toStrictEqual([
    `sync/repo-sync.yml: dispatches of two tools commits share the concurrency group bakery-sync-\${{ github.sha }}, so a newer dispatch replaces a pending one`,
  ]);
});

test('it reports a stub with no concurrency group', () => {
  const stubText = ['name: Bakery sync', ''].join('\n');
  const workflowText = ['jobs:', '  sync:', '    concurrency:', '      queue: max', ''].join('\n');
  const faults = collectRepoSyncConcurrencyFaults(stubText, workflowText);

  expect(faults).toStrictEqual(['sync/repo-sync.yml: the workflow sets no concurrency group']);
});

test('it reports a sync job that keeps the default queue', () => {
  const stubText = [
    'concurrency:',
    `  group: bakery-sync-\${{ github.event.client_payload.sha || github.sha }}`,
    '',
  ].join('\n');

  const workflowText = [
    'jobs:',
    '  sync:',
    '    concurrency:',
    `      group: bakery-sync-\${{ github.repository }}`,
    '      cancel-in-progress: false',
    '',
  ].join('\n');

  const faults = collectRepoSyncConcurrencyFaults(stubText, workflowText);

  expect(faults).toStrictEqual([
    '.github/workflows/repo-sync.yml: the sync job must set queue: max, or a newer run replaces a pending one',
  ]);
});
