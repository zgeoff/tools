import { expect, test } from 'bun:test';
import { buildMockSyncEntry } from '../test-utils/build-mock-sync-entry.ts';
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
        files: [{ repo: 'zgeoff/tools', source: 'sync/socket.yml', target: 'socket.yml' }],
      }),
      buildMockSyncEntry({
        name: 'workflow-demo',
        files: [
          { repo: 'zgeoff/tools', source: 'sync/demo.yml', target: '.github/workflows/demo.yml' },
        ],
        optIn: true,
      }),
    ],
    skip: 'socket',
    include: '',
  });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [editorconfig] });
});

test('it takes each entry that a taken entry needs, and what that entry needs in turn', () => {
  const kettle = buildMockSyncEntry({ name: 'skill-kettle', needs: ['skill-descaling'] });

  const descaling = buildMockSyncEntry({
    name: 'skill-descaling',
    optIn: true,
    needs: ['skill-limescale'],
  });

  const limescale = buildMockSyncEntry({ name: 'skill-limescale', optIn: true });

  const picked = pickSyncEntries({
    manifest: [
      kettle,
      descaling,
      limescale,
      buildMockSyncEntry({ name: 'skill-teapot', optIn: true }),
    ],
    skip: '',
    include: '',
  });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [kettle, descaling, limescale] });
});

test('it takes each entry once when two entries need each other', () => {
  const kettle = buildMockSyncEntry({ name: 'skill-kettle', optIn: true, needs: ['skill-teapot'] });
  const teapot = buildMockSyncEntry({ name: 'skill-teapot', optIn: true, needs: ['skill-kettle'] });
  const picked = pickSyncEntries({ manifest: [kettle, teapot], skip: '', include: 'skill-teapot' });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [kettle, teapot] });
});

test('it leaves out a needed entry that skip lists, and the entries only it needs', () => {
  const kettle = buildMockSyncEntry({ name: 'skill-kettle', needs: ['skill-descaling'] });

  const picked = pickSyncEntries({
    manifest: [
      kettle,
      buildMockSyncEntry({ name: 'skill-descaling', optIn: true, needs: ['skill-limescale'] }),
      buildMockSyncEntry({ name: 'skill-limescale', optIn: true }),
    ],
    skip: 'skill-descaling',
    include: '',
  });

  expect(picked).toStrictEqual({ kind: 'picked', entries: [kettle] });
});

test('it refuses a needs name that no manifest entry holds, with its colons replaced', () => {
  const picked = pickSyncEntries({
    manifest: [buildMockSyncEntry({ name: 'skill-kettle', needs: ['::skill-ghost'] })],
    skip: '',
    include: '',
  });

  expect(picked).toStrictEqual({
    kind: 'refused',
    message: 'needs lists no manifest entry: skill-kettle needs   skill-ghost',
  });
});
