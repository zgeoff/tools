import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from '../../test-utils/build-mock-sync-entry.ts';
import { pickSyncEntries } from './pick-sync-entries.ts';

test('it refuses an include name that no opt-in entry holds, with its colons replaced', () => {
  const picked = pickSyncEntries({
    manifest: [
      buildMockSyncEntry({ name: 'editorconfig' }),
      buildMockSyncEntry({ name: 'workflow-demo', optIn: true }),
    ],
    skip: '',
    include: 'workflow-demo, editorconfig,::ghost',
  });

  expect(picked).toStrictEqual({
    kind: 'refused',
    message: 'include lists no opt-in manifest entry: editorconfig,   ghost',
  });
});

test('it refuses a name that both skip and include list', () => {
  const picked = pickSyncEntries({
    manifest: [buildMockSyncEntry({ name: 'workflow-demo', optIn: true })],
    skip: 'workflow-demo',
    include: 'workflow-demo',
  });

  expect(picked).toStrictEqual({
    kind: 'refused',
    message: 'skip and include both list: workflow-demo',
  });
});

test('it leaves out a skipped entry and an opt-in entry that include does not list', () => {
  const editorconfig = buildMockSyncEntry({ name: 'editorconfig' });

  const picked = pickSyncEntries({
    manifest: [
      editorconfig,
      buildMockSyncEntry({
        name: 'socket',
        files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
      }),
      buildMockSyncEntry({
        name: 'workflow-demo',
        files: [{ source: 'sync/demo.yml', target: '.github/workflows/demo.yml' }],
        optIn: true,
      }),
    ],
    skip: 'socket',
    include: '',
  });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [editorconfig], workflows: false });
});

test('it reports workflows when a picked entry targets a workflow', () => {
  const workflowDemo = buildMockSyncEntry({
    name: 'workflow-demo',
    files: [{ source: 'sync/demo.yml', target: '.github/workflows/demo.yml' }],
    optIn: true,
  });

  const picked = pickSyncEntries({ manifest: [workflowDemo], skip: '', include: 'workflow-demo' });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [workflowDemo], workflows: true });
});
