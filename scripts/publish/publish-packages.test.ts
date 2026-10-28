import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubCommand } from '../../test-utils/create-stub-command.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import { runCommand } from '../ci/run-command.ts';
import { publishPackages } from './publish-packages.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-publish-packages-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');
  const repo = join(directory, 'repo');
  const npmLog = join(directory, 'npm.log');

  await mkdir(bin);
  await mkdir(repo);
  await writeFile(npmLog, '');

  // npm stands in for the registry, and prints the given answer to npm view; bun packs for real.
  const createNPM = (viewOutput: string) => createStubCommand(bin, 'npm', npmLog, viewOutput);
  const output: string[] = [];
  const errors: string[] = [];

  const runPublish = (paths: readonly string[], releasedVersions: string) =>
    publishPackages({
      cwd: repo,
      env: { PATH: `${bin}:${process.env['PATH']}`, HOME: directory },
      pathsText: JSON.stringify(paths),
      releasedVersionsText: releasedVersions,
      runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
      writeError: (text) => {
        errors.push(text);
      },
    });

  const readNPMCalls = () => readFile(npmLog, 'utf8');

  return { repo, output, errors, createNPM, runPublish, readNPMCalls };
}

test('it packs and publishes each released package with provenance', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
  });

  const exitCode = await ctx.runPublish(['packages/std'], '{"packages/std":"0.4.0"}');
  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(0);

  expect(calls).toBe(
    [
      'npm view @zgeoff/std@0.4.0 version',
      'npm publish ./zgeoff-std-0.4.0.tgz --provenance --access public',
      '',
    ].join('\n'),
  );
});

test('it publishes the given paths in a republish by hand, which names no released versions', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
  });

  const exitCode = await ctx.runPublish(['packages/std'], '');
  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(0);

  expect(calls).toBe(
    [
      'npm view @zgeoff/std@0.4.0 version',
      'npm publish ./zgeoff-std-0.4.0.tgz --provenance --access public',
      '',
    ].join('\n'),
  );
});

test('it refuses to publish any package when one holds a version the release did not tag', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
    'packages/tsconfig/package.json': JSON.stringify({
      name: '@zgeoff/tsconfig',
      version: '1.1.9',
    }),
  });

  const exitCode = await ctx.runPublish(
    ['packages/std', 'packages/tsconfig'],
    '{"packages/std":"0.4.0","packages/tsconfig":"1.2.0"}',
  );

  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    `::error::@zgeoff/tsconfig: the release tagged 1.2.0 but ${join(ctx.repo, 'packages/tsconfig/package.json')} holds 1.1.9\n`,
  ]);

  expect(calls).toBe('');
});

test('it skips a private package without asking the registry', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/kettle/package.json': JSON.stringify({
      name: '@acme/kettle',
      version: '2.0.0',
      private: true,
    }),
  });

  const exitCode = await ctx.runPublish(['packages/kettle'], '');
  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(0);
  expect(ctx.output).toStrictEqual(['skipping @acme/kettle: private\n']);
  expect(calls).toBe('');
});

test('it skips a package whose version the registry already holds', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('0.4.0\n');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
  });

  const exitCode = await ctx.runPublish(['packages/std'], '');
  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(0);
  expect(ctx.output).toStrictEqual(['skipping @zgeoff/std@0.4.0: already published\n']);
  expect(calls).toBe('npm view @zgeoff/std@0.4.0 version\n');
});

test('it builds a package that defines a build script before it packs it', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({
      name: '@zgeoff/std',
      version: '0.4.0',
      files: ['dist'],
      scripts: { build: 'mkdir -p dist && echo built > dist/index.js' },
    }),
  });

  const exitCode = await ctx.runPublish(['packages/std'], '');
  const built = await readFile(join(ctx.repo, 'packages/std/dist/index.js'), 'utf8');

  expect(exitCode).toBe(0);
  expect(built).toBe('built\n');
});

test('it refuses a paths list that is not a JSON array and publishes nothing', async () => {
  const ctx = await setupTest();

  const exitCode = await publishPackages({
    cwd: ctx.repo,
    env: {},
    pathsText: 'packages/std',
    releasedVersionsText: '',
    runCommand,
    writeOutput: () => {},
    writeError: (text) => {
      ctx.errors.push(text);
    },
  });

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '::error::PATHS_RELEASED holds no JSON array of paths, or RELEASED_VERSIONS no JSON object of versions\n',
  ]);
});

test('it refuses a released versions value that is not a JSON object and publishes nothing', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  const exitCode = await ctx.runPublish(['packages/std'], '["0.4.0"]');
  const calls = await ctx.readNPMCalls();

  expect(exitCode).toBe(1);

  expect(ctx.errors).toStrictEqual([
    '::error::PATHS_RELEASED holds no JSON array of paths, or RELEASED_VERSIONS no JSON object of versions\n',
  ]);

  expect(calls).toBe('');
});

test('it refuses a package.json that holds no JSON object and runs no npm command', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, { 'packages/std/package.json': 'null' });

  expect(ctx.runPublish(['packages/std'], '')).rejects.toThrow(
    `${join(ctx.repo, 'packages/std')}/package.json holds no JSON object`,
  );

  const calls = await ctx.readNPMCalls();

  expect(calls).toBe('');
});

test('it refuses a package.json with no version and runs no npm command', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std' }),
  });

  expect(ctx.runPublish(['packages/std'], '')).rejects.toThrow(
    `${join(ctx.repo, 'packages/std')}/package.json names no package and version`,
  );

  const calls = await ctx.readNPMCalls();

  expect(calls).toBe('');
});

test('it refuses to publish when the pack leaves more than one tarball', async () => {
  const ctx = await setupTest();

  await ctx.createNPM('');

  await writeTreeFiles(ctx.repo, {
    'packages/std/package.json': JSON.stringify({ name: '@zgeoff/std', version: '0.4.0' }),
    'packages/std/zgeoff-std-0.3.9.tgz': 'an older pack',
  });

  expect(ctx.runPublish(['packages/std'], '')).rejects.toThrow(
    `bun pm pack left 2 tarballs in ${join(ctx.repo, 'packages/std')}`,
  );

  const calls = await ctx.readNPMCalls();

  expect(calls).toBe('npm view @zgeoff/std@0.4.0 version\n');
});
