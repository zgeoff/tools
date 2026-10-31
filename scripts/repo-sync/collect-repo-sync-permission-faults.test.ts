import { expect, test } from 'bun:test';
import { collectRepoSyncPermissionFaults } from './collect-repo-sync-permission-faults.ts';

test('it reports nothing when the stub grants every permission and the alarm job reads actions', () => {
  const stubText = [
    'jobs:',
    '  sync:',
    '    permissions:',
    '      contents: read',
    '      actions: read',
    '',
  ].join('\n');

  const workflowText = [
    'jobs:',
    '  alarm:',
    '    permissions:',
    '      contents: read',
    '      actions: read',
    '',
  ].join('\n');

  const faults = collectRepoSyncPermissionFaults(stubText, workflowText);

  expect(faults).toBeEmpty();
});

test('it reports a job permission that the stub withholds', () => {
  const stubText = ['jobs:', '  sync:', '    permissions:', '      contents: read', ''].join('\n');

  const workflowText = [
    'jobs:',
    '  alarm:',
    '    permissions:',
    '      contents: read',
    '      actions: read',
    '',
  ].join('\n');

  const faults = collectRepoSyncPermissionFaults(stubText, workflowText);

  expect(faults).toStrictEqual([
    'sync/repo-sync.yml: the alarm job asks for actions: read, which the stub withholds',
  ]);
});

test('it reports a write that the stub grants only as a read', () => {
  const stubText = [
    'jobs:',
    '  sync:',
    '    permissions:',
    '      issues: read',
    '      actions: read',
    '',
  ].join('\n');

  const workflowText = [
    'jobs:',
    '  alarm:',
    '    permissions:',
    '      issues: write',
    '      actions: read',
    '',
  ].join('\n');

  const faults = collectRepoSyncPermissionFaults(stubText, workflowText);

  expect(faults).toStrictEqual([
    'sync/repo-sync.yml: the alarm job asks for issues: write, which the stub withholds',
  ]);
});

test('it accepts a read that the stub grants as a write, and a none it never grants', () => {
  const stubText = [
    'jobs:',
    '  sync:',
    '    permissions:',
    '      issues: write',
    '      actions: read',
    '',
  ].join('\n');

  const workflowText = [
    'jobs:',
    '  alarm:',
    '    permissions:',
    '      issues: read',
    '      packages: none',
    '      actions: read',
    '',
  ].join('\n');

  const faults = collectRepoSyncPermissionFaults(stubText, workflowText);

  expect(faults).toBeEmpty();
});

test('it reports an alarm job that does not ask for actions: read, whatever the stub grants', () => {
  const stubText = ['jobs:', '  sync:', '    permissions:', '      actions: read', ''].join('\n');

  const workflowText = ['jobs:', '  alarm:', '    permissions:', '      actions: none', ''].join(
    '\n',
  );

  const faults = collectRepoSyncPermissionFaults(stubText, workflowText);

  expect(faults).toStrictEqual([
    '.github/workflows/repo-sync.yml: the alarm job must ask for actions: read, or it cannot read the checks of a private repo',
  ]);
});
