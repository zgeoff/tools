import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { writeSyncEntries } from './write-sync-entries.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-sync-entries-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');

  const runPrepare = async (manifest: unknown, skip: string, include: string) => {
    await mkdir(join(directory, 'sync'), { recursive: true });
    await writeFile(join(directory, 'sync', 'manifest.json'), JSON.stringify(manifest));
    await writeFile(outputPath, '');

    const exitCode = await writeSyncEntries({ cwd: directory, skip, include, outputPath });
    const output = await readFile(outputPath, 'utf8');

    return { exitCode, output };
  };

  return { runPrepare };
}

test.each([
  ['true when a selected entry', 'workflow-demo', 'true'],
  ['false when only a filtered-out entry', '', 'false'],
])('it outputs workflows %s targets a workflow', async (_label, include, expected) => {
  const ctx = await setupTest();

  const result = await ctx.runPrepare(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
      {
        name: 'workflow-demo',
        description: 'The demo workflow',
        optIn: true,
        files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      },
    ],
    '',
    include,
  );

  expect(result.exitCode).toBe(0);
  expect(result.output).toEndWith(`\nworkflows=${expected}\n`);
});

test('it outputs the entries it keeps as compact JSON, without optIn and with workflows', async () => {
  const ctx = await setupTest();

  const result = await ctx.runPrepare(
    [
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
      {
        name: 'socket',
        description: 'The Socket config',
        files: [{ source: 'sync/socket.yml', target: 'socket.yml' }],
      },
      {
        name: 'workflow-demo',
        description: 'The demo workflow',
        optIn: true,
        files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      },
    ],
    ' socket ',
    'workflow-demo',
  );

  const entries = [
    {
      name: 'editorconfig',
      description: 'The editor config',
      files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      workflows: false,
    },
    {
      name: 'workflow-demo',
      description: 'The demo workflow',
      files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      workflows: true,
    },
  ];

  expect(result).toStrictEqual({
    exitCode: 0,
    output: `entries=${JSON.stringify(entries)}\nworkflows=true\n`,
  });
});

test('it fails and writes no output when include names an entry that is not opt-in', async () => {
  const ctx = await setupTest();

  const result = await ctx.runPrepare(
    [{ name: 'editorconfig', files: [{ source: 'sync/editorconfig', target: '.editorconfig' }] }],
    '',
    'editorconfig,ghost::x',
  );

  expect(result).toStrictEqual({ exitCode: 1, output: '' });
});

test('it fails and writes no output when skip and include name the same entry', async () => {
  const ctx = await setupTest();

  const result = await ctx.runPrepare(
    [
      {
        name: 'workflow-demo',
        optIn: true,
        files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      },
    ],
    'workflow-demo',
    'workflow-demo',
  );

  expect(result).toStrictEqual({ exitCode: 1, output: '' });
});
