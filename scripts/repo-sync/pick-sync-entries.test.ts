import { expect, test } from 'bun:test';
import { pickSyncEntries } from './pick-sync-entries.ts';

test('it refuses an include name that no opt-in entry holds, with its colons replaced', () => {
  const picked = pickSyncEntries({
    manifest: [
      { name: 'editorconfig', files: [] },
      { name: 'workflow-demo', optIn: true, files: [] },
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
    manifest: [{ name: 'workflow-demo', optIn: true, files: [] }],
    skip: 'workflow-demo',
    include: 'workflow-demo',
  });

  expect(picked).toStrictEqual({
    kind: 'refused',
    message: 'skip and include both list: workflow-demo',
  });
});

test('it leaves out a skipped entry and an opt-in entry that include does not list', () => {
  const picked = pickSyncEntries({
    manifest: [
      { name: 'editorconfig', files: [{ target: '.editorconfig' }] },
      { name: 'socket', files: [{ target: 'socket.yml' }] },
      { name: 'workflow-demo', optIn: true, files: [{ target: '.github/workflows/demo.yml' }] },
    ],
    skip: 'socket',
    include: '',
  });

  expect(picked).toStrictEqual({
    kind: 'picked',
    entries: [{ name: 'editorconfig', files: [{ target: '.editorconfig' }], workflows: false }],
    workflows: false,
  });
});
