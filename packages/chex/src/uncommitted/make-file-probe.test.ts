import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { makeFileProbe } from './make-file-probe.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('make-file-probe-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const root = join(directory, 'repo');

  await mkdir(join(root, 'real'), { recursive: true });
  await writeFile(join(root, 'real/a.md'), 'a\n');
  await writeFile(join(root, 'top.md'), 'top\n');
  await symlink('real', join(root, 'linked'));
  await symlink('top.md', join(root, 'top-link.md'));

  return { root, probe: makeFileProbe(root) };
}

test.each([
  ['real/a.md', true],
  ['top.md', true],
  ['top-link.md', true],
  ['linked/a.md', false],
  ['real/missing.md', false],
])('it reads %p as present: %p', async (path, present) => {
  const ctx = await setupTest();

  expect(ctx.probe(join(ctx.root, path))).toBe(present);
});

test('it reads a file below a root that is itself under a link as present', async () => {
  const ctx = await setupTest();

  const linkedRoot = `${ctx.root}-via-link`;

  await symlink(ctx.root, linkedRoot);

  onTestFinished(() => rm(linkedRoot, { force: true }));

  expect(makeFileProbe(linkedRoot)(join(linkedRoot, 'real/a.md'))).toBe(true);
});
