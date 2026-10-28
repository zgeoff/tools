import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubFileServer } from '../../test-utils/create-stub-file-server.ts';
import { createTarArchive } from '../../test-utils/create-tar-archive.ts';
import { installPinnedTool } from './install-pinned-tool.ts';
import { nodeFileSystem } from './node-file-system.ts';
import { runCommand } from './run-command.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-install-pinned-tool-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runnerTemp = join(directory, 'runner');
  const githubPath = join(directory, 'github-path');

  await mkdir(runnerTemp);

  return { directory, runnerTemp, githubPath };
}

test('it installs a binary release into a runner folder on the PATH when the checksum matches', async () => {
  const ctx = await setupTest();

  await installPinnedTool({
    name: 'shfmt',
    pin: {
      url: `${createStubFileServer({ '/shfmt': [{ status: 200, body: 'fake shfmt\n' }] }).url}/shfmt`,
      sha256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
      packaging: 'binary',
      neededBy: 'shell check',
    },
    runnerTemp: ctx.runnerTemp,
    githubPath: ctx.githubPath,
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
  });

  const installed = await readFile(join(ctx.runnerTemp, 'shfmt-bin/shfmt'), 'utf8');
  const stats = await stat(join(ctx.runnerTemp, 'shfmt-bin/shfmt'));
  const githubPath = await readFile(ctx.githubPath, 'utf8');

  expect(installed).toBe('fake shfmt\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.runnerTemp, 'shfmt-bin')}\n`);
});

test('it installs nothing when the download fails its checksum', async () => {
  const ctx = await setupTest();

  const installing = installPinnedTool({
    name: 'shfmt',
    pin: {
      url: `${createStubFileServer({ '/shfmt': [{ status: 200, body: 'fake shfmt\n' }] }).url}/shfmt`,
      sha256: '0'.repeat(64),
      packaging: 'binary',
      neededBy: 'shell check',
    },
    runnerTemp: ctx.runnerTemp,
    githubPath: ctx.githubPath,
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
  });

  expect(installing).rejects.toThrow(
    `shfmt: the download's sha256 is ${new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex')}, not the pinned ${'0'.repeat(64)}`,
  );

  const runnerFiles = await readdir(ctx.runnerTemp);
  const wrotePath = await Bun.file(ctx.githubPath).exists();

  expect(runnerFiles).toStrictEqual([]);
  expect(wrotePath).toBeFalse();
});

test('it installs only the tool from a release archive into a runner folder on the PATH', async () => {
  const ctx = await setupTest();

  const archive = await createTarArchive(ctx.directory, {
    actionlint: { content: 'fake actionlint\n', mode: 0o755 },
    'README.md': { content: 'fake readme\n', mode: 0o644 },
  });

  await installPinnedTool({
    name: 'actionlint',
    pin: {
      url: `${createStubFileServer({ '/actionlint.tar.gz': [{ status: 200, body: archive }] }).url}/actionlint.tar.gz`,
      sha256: new Bun.CryptoHasher('sha256').update(archive).digest('hex'),
      packaging: 'tar.gz',
      neededBy: 'workflows check',
    },
    runnerTemp: ctx.runnerTemp,
    githubPath: ctx.githubPath,
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
  });

  const installed = await readdir(join(ctx.runnerTemp, 'actionlint-bin'));
  const binary = await readFile(join(ctx.runnerTemp, 'actionlint-bin/actionlint'), 'utf8');
  const stats = await stat(join(ctx.runnerTemp, 'actionlint-bin/actionlint'));
  const githubPath = await readFile(ctx.githubPath, 'utf8');

  expect(installed).toStrictEqual(['actionlint']);
  expect(binary).toBe('fake actionlint\n');
  expect(stats.mode & 0o777).toBe(0o755);
  expect(githubPath).toBe(`${join(ctx.runnerTemp, 'actionlint-bin')}\n`);
});

test('it extracts nothing from a release archive that fails its checksum', async () => {
  const ctx = await setupTest();

  const archive = await createTarArchive(ctx.directory, {
    actionlint: { content: 'fake actionlint\n', mode: 0o755 },
  });

  const installing = installPinnedTool({
    name: 'actionlint',
    pin: {
      url: `${createStubFileServer({ '/actionlint.tar.gz': [{ status: 200, body: archive }] }).url}/actionlint.tar.gz`,
      sha256: '0'.repeat(64),
      packaging: 'tar.gz',
      neededBy: 'workflows check',
    },
    runnerTemp: ctx.runnerTemp,
    githubPath: ctx.githubPath,
    env: process.env,
    fileSystem: nodeFileSystem,
    runCommand,
  });

  expect(installing).rejects.toThrow("actionlint: the download's sha256 is");

  const runnerFiles = await readdir(ctx.runnerTemp);
  const wrotePath = await Bun.file(ctx.githubPath).exists();

  expect(runnerFiles).toStrictEqual([]);
  expect(wrotePath).toBeFalse();
});
