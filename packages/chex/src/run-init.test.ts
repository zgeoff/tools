import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOptionalText } from './read-optional-text.ts';
import { runInit } from './run-init.ts';
import { writeTextFile } from './write-text-file.ts';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'chex-init-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  const lines: string[] = [];

  const run = () =>
    runInit({
      repoRoot,
      readText: readOptionalText,
      writeText: writeTextFile,
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

  const packageText = JSON.stringify({
    name: 'kettle',
    devDependencies: { '@zgeoff/chex': '0.1.0', '@zgeoff/diet': '0.1.2', '@zgeoff/rig': '0.0.2' },
  });

  return { repoRoot, lines, run, readFiles, packageText };
}

test('it writes lefthook.yml and package.json to the repo folder, and reports each', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.repoRoot, 'package.json'), ctx.packageText);

  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines, lefthook: files[1] }).toStrictEqual({
    exitCode: 0,
    lines: [
      'out chex init: lefthook.yml extends node_modules/@zgeoff/chex/lefthook.yml\n' +
        'chex init: package.json runs "chex prose length links" as check:docs\n',
    ],
    lefthook: 'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
  });

  expect(files[0]).toInclude('"check:docs": "chex prose length links"');
});

test('it leaves every file as it was on a second run', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.repoRoot, 'package.json'), ctx.packageText);

  await ctx.run();

  const files = await ctx.readFiles();

  ctx.lines.length = 0;

  const exitCode = await ctx.run();
  const filesAfter = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines, files: filesAfter }).toStrictEqual({
    exitCode: 0,
    lines: ['out chex init: the repo already takes the baseline; nothing to change\n'],
    files,
  });
});

test('it fails and leaves both files as they were when lefthook.yml lists extends inline', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.repoRoot, 'package.json'), ctx.packageText);
  await writeFile(join(ctx.repoRoot, 'lefthook.yml'), 'extends: [local.yml]\n');

  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines, files }).toStrictEqual({
    exitCode: 1,
    lines: [
      'err chex init: lefthook.yml writes extends in a form chex init does not edit; add node_modules/@zgeoff/chex/lefthook.yml to its list\n',
    ],
    files: [ctx.packageText, 'extends: [local.yml]\n'],
  });
});

test('it fails and writes nothing in a folder with no package.json', async () => {
  const ctx = await setupTest();
  const exitCode = await ctx.run();
  const files = await ctx.readFiles();

  expect({ exitCode, lines: ctx.lines, files }).toStrictEqual({
    exitCode: 1,
    lines: ['err chex init: the folder has no package.json; run chex init from the repo root\n'],
    files: [undefined, undefined],
  });
});
