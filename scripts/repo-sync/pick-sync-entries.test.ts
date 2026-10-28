import { expect, test } from 'bun:test';
import { pickSyncEntries } from './pick-sync-entries.ts';

test('it refuses an include name that no opt-in entry holds, with its colons replaced', () => {
  const picked = pickSyncEntries({
    manifest: [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [],
        build: '',
        optIn: false,
      },
      { name: 'workflow-demo', description: 'The demo', files: [], build: '', optIn: true },
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
    manifest: [
      { name: 'workflow-demo', description: 'The demo', files: [], build: '', optIn: true },
    ],
    skip: 'workflow-demo',
    include: 'workflow-demo',
  });

  expect(picked).toStrictEqual({
    kind: 'refused',
    message: 'skip and include both list: workflow-demo',
  });
});

test('it leaves out a skipped entry and an opt-in entry that include does not list', () => {
  const editorconfig = {
    name: 'editorconfig',
    description: 'The editor config',
    files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
    build: '',
    optIn: false,
  };

  const picked = pickSyncEntries({
    manifest: [
      editorconfig,
      {
        name: 'socket',
        description: 'The Socket config',
        files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
        build: '',
        optIn: false,
      },
      {
        name: 'workflow-demo',
        description: 'The demo',
        files: [{ source: 'sync/demo.yml', target: '.github/workflows/demo.yml' }],
        build: '',
        optIn: true,
      },
    ],
    skip: 'socket',
    include: '',
  });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [editorconfig], workflows: false });
});

test('it reports workflows when a picked entry targets a workflow', () => {
  const workflowDemo = {
    name: 'workflow-demo',
    description: 'The demo',
    files: [{ source: 'sync/demo.yml', target: '.github/workflows/demo.yml' }],
    build: '',
    optIn: true,
  };

  const picked = pickSyncEntries({ manifest: [workflowDemo], skip: '', include: 'workflow-demo' });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [workflowDemo], workflows: true });
});
