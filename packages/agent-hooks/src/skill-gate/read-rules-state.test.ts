import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRulesState } from './read-rules-state.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'skill-gate-rules-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it reads the text of a rules file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'skill-gate.json'), '{"gates":[]}');

  const state = await readRulesState(join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'readable', text: '{"gates":[]}' });
});

test('it reads a path that holds nothing as missing', async () => {
  const ctx = await setupTest();
  const state = await readRulesState(join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a path under a file as missing', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, '.claude'), '');

  const state = await readRulesState(join(ctx.directory, '.claude/skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a symlink that points nowhere as missing', async () => {
  const ctx = await setupTest();

  await symlink('rules.json', join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'missing' });
});

test('it reads a folder as unreadable', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({ kind: 'unreadable', reason: 'it is a folder', code: 'EISDIR' });
});

test('it reads a symlink loop as unreadable and names the error code', async () => {
  const ctx = await setupTest();

  await symlink('skill-gate.json', join(ctx.directory, 'skill-gate.json'));

  const state = await readRulesState(join(ctx.directory, 'skill-gate.json'));

  expect(state).toStrictEqual({
    kind: 'unreadable',
    reason: 'ELOOP: too many symbolic links encountered',
    code: 'ELOOP',
  });
});
