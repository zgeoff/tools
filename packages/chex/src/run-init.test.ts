import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOptionalText } from '@zgeoff/std';
import { lockFileWrites } from '../../../test-utils/lock-file-writes.ts';
import { runInit } from './run-init.ts';
import { writeTextFile } from './write-text-file.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'chex-init-'));

  const unlocks: (() => Promise<void>)[] = [];

  // A locked file blocks the folder's removal, so each unlock runs first.
  onTestFinished(async () => {
    await Promise.all(unlocks.map((unlock) => unlock()));

    await rm(repoRoot, { recursive: true, force: true });
  });

  const lockFile = async (name: string) => {
    const unlock = await lockFileWrites(join(repoRoot, name));

    unlocks.push(unlock);
  };

  const lines: string[] = [];

  const run = () =>
    runInit({
      repoRoot,
      readText: readOptionalText,
      writeText: writeTextFile,
      renameFile: (from, to) => rename(from, to),
      removeFile: (path) => rm(path, { force: true }),
      writeOutput: (text) => {
        lines.push(`out ${text}`);
      },
      writeError: (text) => {
        lines.push(`err ${text}`);
      },
    });

  const readFiles = () =>
    Promise.all([
      readOptionalText(join(repoRoot, 'package.json')),
      readOptionalText(join(repoRoot, 'lefthook.yml')),
    ]);

  return { repoRoot, lines, run, readFiles, lockFile };
}

test('it writes lefthook.yml and package.json to the repo folder, and reports each', async () => {
  const ctx = await setupTest();

  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  await writeFile(join(ctx.repoRoot, 'package.json'), packageText);

  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 0,
    lines: [
      'out chex init: lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml\n' +
        'chex init: package.json runs "chex prose length links" as check:docs\n',
    ],
  });

  expect(files[1]).toBe('extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n');
  expect(files[0]).toInclude('"check:docs": "chex prose length links"');
});

test('it leaves every file as it was on a second run', async () => {
  const ctx = await setupTest();

  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  await writeFile(join(ctx.repoRoot, 'package.json'), packageText);

  await ctx.run();

  const files = await ctx.readFiles();

  ctx.lines.length = 0;

  const exitCode = await ctx.run();
  const filesAfter = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 0,
    lines: ['out chex init: the repo already takes the baseline; nothing to change\n'],
  });

  expect(filesAfter).toStrictEqual(files);
});

test('it fails and leaves both files as they were when lefthook.yml writes extends as a single path', async () => {
  const ctx = await setupTest();

  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  await writeFile(join(ctx.repoRoot, 'package.json'), packageText);
  await writeFile(join(ctx.repoRoot, 'lefthook.yml'), 'extends: local.yml\n');

  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 1,
    lines: [
      'err chex init: lefthook.yml writes extends in a form chex init does not edit; add node_modules/@zgeoff/chex/lefthook.yml to its list\n',
    ],
  });

  expect(files).toStrictEqual([packageText, 'extends: local.yml\n']);
});

test('it fails and writes nothing in a folder with no package.json', async () => {
  const ctx = await setupTest();
  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 1,
    lines: ['err chex init: the folder has no package.json; run chex init from the repo root\n'],
  });

  expect(files).toStrictEqual([undefined, undefined]);
});

// Only ext4's immutable flag, which needs root, stops a rename onto a file; a read-only mode does not.
const canBlockReplace = process.getuid?.() === 0;

test.skipIf(!canBlockReplace)(
  'it puts lefthook.yml back as it was when package.json cannot be replaced',
  async () => {
    const ctx = await setupTest();

    const packageText = JSON.stringify({
      name: 'kettle',
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    });

    await writeFile(join(ctx.repoRoot, 'package.json'), packageText);
    await writeFile(join(ctx.repoRoot, 'lefthook.yml'), 'extends: [.lefthook/local.yml]\n');

    await ctx.lockFile('package.json');

    const exitCode = await ctx.run();
    const files = await ctx.readFiles();
    const names = await readdir(ctx.repoRoot);

    expect({ exitCode, lines: ctx.lines }).toStrictEqual({
      exitCode: 1,
      lines: [
        expect.stringMatching(
          /^err chex init: could not replace package\.json: .+, so both files stay as they were\n$/u,
        ),
      ],
    });

    expect(files).toStrictEqual([packageText, 'extends: [.lefthook/local.yml]\n']);
    expect(names.toSorted()).toStrictEqual(['lefthook.yml', 'package.json']);
  },
);

test.skipIf(!canBlockReplace)(
  'it removes the lefthook.yml it wrote when package.json cannot be replaced',
  async () => {
    const ctx = await setupTest();

    const packageText = JSON.stringify({
      name: 'kettle',
      devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
    });

    await writeFile(join(ctx.repoRoot, 'package.json'), packageText);

    await ctx.lockFile('package.json');

    const exitCode = await ctx.run();
    const files = await ctx.readFiles();

    expect(exitCode).toBe(1);
    expect(files).toStrictEqual([packageText, undefined]);
  },
);

test('it leaves both files untouched when the staged package.json fails midway', async () => {
  const ctx = await setupTest();

  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  await writeFile(join(ctx.repoRoot, 'package.json'), packageText);
  await writeFile(join(ctx.repoRoot, 'lefthook.yml'), 'extends: [.lefthook/local.yml]\n');

  // A locked file where init stages package.json makes the second of the two writes fail.
  await writeFile(join(ctx.repoRoot, 'package.json.chex-init'), '');

  await ctx.lockFile('package.json.chex-init');

  const exitCode = await ctx.run();
  const files = await ctx.readFiles();
  const names = await readdir(ctx.repoRoot);

  expect({ exitCode, lines: ctx.lines }).toStrictEqual({
    exitCode: 1,
    lines: [
      expect.stringMatching(
        /^err chex init: could not write package\.json: .+, so both files stay as they were\n$/u,
      ),
    ],
  });

  expect(files).toStrictEqual([packageText, 'extends: [.lefthook/local.yml]\n']);

  expect(names.toSorted()).toStrictEqual([
    'lefthook.yml',
    'package.json',
    'package.json.chex-init',
  ]);
});
