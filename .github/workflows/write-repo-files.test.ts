import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeRepoFiles } from './write-repo-files.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'write-repo-files-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it writes each file under the repo, creating the folders a nested path needs', async () => {
  const ctx = await setupTest();

  await writeRepoFiles(ctx.directory, {
    'README.md': '# app\n',
    'docker/app/Dockerfile': 'FROM scratch\n',
  });

  const readme = await readFile(join(ctx.directory, 'README.md'), 'utf8');
  const dockerfile = await readFile(join(ctx.directory, 'docker/app/Dockerfile'), 'utf8');

  expect({ readme, dockerfile }).toStrictEqual({ readme: '# app\n', dockerfile: 'FROM scratch\n' });
});

test('it replaces the content of a file that exists', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'README.md'), '# old\n');
  await writeRepoFiles(ctx.directory, { 'README.md': '# new\n' });

  const readme = await readFile(join(ctx.directory, 'README.md'), 'utf8');

  expect(readme).toBe('# new\n');
});
