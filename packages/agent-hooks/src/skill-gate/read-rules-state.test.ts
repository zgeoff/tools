import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRulesState } from './read-rules-state.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-rules-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const fileSystem = { stat, readText: (filePath: string) => readFile(filePath, 'utf8') };

  return { directory, stack, fileSystem };
}

test('it reads the text of a rules file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'skill-gate.json'), '{"gates":[]}');

  const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'readable', text: '{"gates":[]}' });
});

test('it reads a path that holds nothing as missing', async () => {
  const ctx = await setupTest();
  const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a path under a file as missing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, '.claude'), '');

  const state = await readRulesState(
    ctx.fileSystem,
    join(ctx.directory, '.claude/skill-gate.json'),
  );

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a symlink that points nowhere as missing', async () => {
  const ctx = await setupTest();

  await symlink('rules.json', join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a folder as unreadable', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'unreadable', reason: 'it is a folder', cause: 'folder' });
});

test('it reads a symlink loop as unreadable and names the error code', async () => {
  const ctx = await setupTest();

  await symlink('skill-gate.json', join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({
    kind: 'unreadable',
    reason: 'ELOOP: too many symbolic links encountered',
    cause: 'other',
  });
});

// Root reads a mode 000 file and searches a mode 000 folder, so the read fails only for another
// user.
test.skipIf(process.getuid?.() === 0)(
  'it reads a rules file whose read is refused as a permission problem of the file',
  async () => {
    const ctx = await setupTest();

    await writeFile(join(ctx.directory, 'skill-gate.json'), '{"gates":[]}');
    await chmod(join(ctx.directory, 'skill-gate.json'), 0o000);

    const state = await readRulesState(ctx.fileSystem, join(ctx.directory, 'skill-gate.json'));

    expect(state).toStrictEqual({
      kind: 'unreadable',
      reason: 'EACCES: permission denied',
      cause: 'file-permission',
    });
  },
);

test.skipIf(process.getuid?.() === 0)(
  'it reads a rules file in a folder it cannot search as unreadable for another cause',
  async () => {
    const ctx = await setupTest();

    await mkdir(join(ctx.directory, '.claude'));
    await writeFile(join(ctx.directory, '.claude/skill-gate.json'), '{"gates":[]}');
    await chmod(join(ctx.directory, '.claude'), 0o000);

    ctx.stack.defer(() => chmod(join(ctx.directory, '.claude'), 0o700));

    const state = await readRulesState(
      ctx.fileSystem,
      join(ctx.directory, '.claude/skill-gate.json'),
    );

    expect(state).toStrictEqual({
      kind: 'unreadable',
      reason: 'EACCES: permission denied',
      cause: 'other',
    });
  },
);
