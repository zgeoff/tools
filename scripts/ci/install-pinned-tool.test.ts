import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubFileServer } from '../../test-utils/create-stub-file-server.ts';
import { installPinnedTool, shouldInstallTool } from './install-pinned-tool.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-install-pinned-tool-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runnerTemp = join(directory, 'runner');
  const githubPath = join(directory, 'github-path');

  await mkdir(runnerTemp);

  const createReleaseArchive = async (files: Readonly<Record<string, string>>) => {
    const release = join(directory, 'release');

    await mkdir(release);

    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(release, name), content, { mode: 0o755 });
    }

    const archive = join(directory, 'release.tar.gz');

    await $`tar -czf ${archive} -C ${release} ${Object.keys(files)}`.quiet();

    return readFile(archive);
  };

  return { runnerTemp, githubPath, createReleaseArchive };
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

  const archive = await ctx.createReleaseArchive({
    actionlint: 'fake actionlint\n',
    'README.md': 'fake readme\n',
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
  const archive = await ctx.createReleaseArchive({ actionlint: 'fake actionlint\n' });

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
  });

  expect(installing).rejects.toThrow("actionlint: the download's sha256 is");

  const runnerFiles = await readdir(ctx.runnerTemp);
  const wrotePath = await Bun.file(ctx.githubPath).exists();

  expect(runnerFiles).toStrictEqual([]);
  expect(wrotePath).toBeFalse();
});

test.each([
  ['the static job', 'static', 'false', true],
  ['the private checks job', 'all', 'false', true],
  ['a test job whose caller asks for it', 'test', 'true', true],
  ['a test job', 'test', 'false', false],
  ['a lane job', 'lane', 'false', false],
  ['a lane job whose caller asks for it', 'lane', 'true', true],
])(
  'it installs a check tool for %s only when the job runs its check or the caller asks',
  (_label, part, requested, expected) => {
    expect(shouldInstallTool(part, requested)).toBe(expected);
  },
);
