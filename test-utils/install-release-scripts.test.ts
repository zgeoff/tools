import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installReleaseScripts } from './install-release-scripts.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'install-release-scripts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it copies both release scripts into the directory and nothing else', async () => {
  const ctx = await setupTest();

  await installReleaseScripts(ctx.directory);

  const files = await readdir(ctx.directory);

  expect(files.toSorted()).toStrictEqual(['check-release-head.sh', 'merge-release-prs.sh']);
});

test.each(['check-release-head.sh', 'merge-release-prs.sh'])(
  'it copies %s byte for byte from the repo',
  async (script) => {
    const ctx = await setupTest();

    await installReleaseScripts(ctx.directory);

    const installed = await readFile(join(ctx.directory, script), 'utf8');
    const source = await readFile(join(import.meta.dir, '..', 'scripts', script), 'utf8');

    expect(installed).toBe(source);
  },
);

test('it replaces a script that the directory already holds', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'merge-release-prs.sh'), '# stale script\n');
  await installReleaseScripts(ctx.directory);

  const installed = await readFile(join(ctx.directory, 'merge-release-prs.sh'), 'utf8');

  expect(installed).not.toBe('# stale script\n');
});
