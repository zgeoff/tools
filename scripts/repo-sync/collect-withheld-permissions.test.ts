import { expect, test } from 'bun:test';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { collectWithheldPermissions } from './collect-withheld-permissions.ts';

test('it reports a job permission that the stub withholds', () => {
  const stubText = ['jobs:', '  sync:', '    permissions:', '      contents: read', ''].join('\n');

  const workflowText = [
    'jobs:',
    '  bake:',
    '    permissions:',
    '      contents: read',
    '      actions: read',
    '',
  ].join('\n');

  const withheld = collectWithheldPermissions(stubText, workflowText);

  expect(withheld).toStrictEqual(['bake asks for actions: read, which the stub withholds']);
});

test('it reports a write that the stub grants only as a read', () => {
  const stubText = ['jobs:', '  sync:', '    permissions:', '      issues: read', ''].join('\n');

  const workflowText = ['jobs:', '  bake:', '    permissions:', '      issues: write', ''].join(
    '\n',
  );

  const withheld = collectWithheldPermissions(stubText, workflowText);

  expect(withheld).toStrictEqual(['bake asks for issues: write, which the stub withholds']);
});

test('it accepts a read that the stub grants as a write, and a none it never grants', () => {
  const stubText = ['jobs:', '  sync:', '    permissions:', '      issues: write', ''].join('\n');

  const workflowText = [
    'jobs:',
    '  bake:',
    '    permissions:',
    '      issues: read',
    '      packages: none',
    '',
  ].join('\n');

  const withheld = collectWithheldPermissions(stubText, workflowText);

  expect(withheld).toBeEmpty();
});

test('it finds nothing withheld between the stub and the reusable sync workflow', async () => {
  const stubText = await nodeFileSystem.readText('sync/repo-sync.yml');
  const workflowText = await nodeFileSystem.readText('.github/workflows/repo-sync.yml');

  const withheld = collectWithheldPermissions(stubText, workflowText);

  expect(withheld).toBeEmpty();
});
