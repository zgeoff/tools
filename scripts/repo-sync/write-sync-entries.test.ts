import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildMockSyncEntry } from '../../test-utils/build-mock-sync-entry.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeSyncEntries } from './write-sync-entries.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-sync-entries-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'sync'));

  const manifestPath = join(directory, 'sync', 'manifest.json');
  const outputPath = join(directory, 'output');
  const output: string[] = [];

  const writeOutput = (text: string) => {
    output.push(text);
  };

  return { directory, manifestPath, outputPath, output, writeOutput };
}

test('it outputs the entries it keeps as compact JSON in the sync entry contract', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.manifestPath,
    JSON.stringify([
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
    ]),
  );

  await writeFile(ctx.outputPath, '');

  const exitCode = await writeSyncEntries({
    cwd: ctx.directory,
    skip: ' socket ',
    include: 'workflow-demo',
    outputPath: ctx.outputPath,
    fileSystem: nodeFileSystem,
    writeOutput: ctx.writeOutput,
  });

  const outputs = await readFile(ctx.outputPath, 'utf8');

  const entries = [
    buildMockSyncEntry({ name: 'editorconfig' }),
    buildMockSyncEntry({
      name: 'workflow-demo',
      description: 'The demo workflow',
      files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      optIn: true,
    }),
  ];

  expect(exitCode).toBe(0);
  expect(outputs).toBe(`entries=${JSON.stringify(entries)}\n`);
  expect(ctx.output).toStrictEqual([]);
});

test('it fails with an error and writes no output when include names an entry that is not opt-in', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.manifestPath,
    JSON.stringify([
      {
        name: 'editorconfig',
        description: 'The editor config',
        files: [{ source: 'sync/editorconfig', target: '.editorconfig' }],
      },
    ]),
  );

  await writeFile(ctx.outputPath, '');

  const exitCode = await writeSyncEntries({
    cwd: ctx.directory,
    skip: '',
    include: 'editorconfig,ghost::x',
    outputPath: ctx.outputPath,
    fileSystem: nodeFileSystem,
    writeOutput: ctx.writeOutput,
  });

  const outputs = await readFile(ctx.outputPath, 'utf8');

  expect(exitCode).toBe(1);
  expect(outputs).toBe('');

  expect(ctx.output).toStrictEqual([
    '::error::include lists no opt-in manifest entry: editorconfig, ghost  x\n',
  ]);
});

test('it fails with an error and writes no output when skip and include name the same entry', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.manifestPath,
    JSON.stringify([
      {
        name: 'workflow-demo',
        description: 'The demo workflow',
        optIn: true,
        files: [{ source: 'sync/workflow-demo.yml', target: '.github/workflows/demo.yml' }],
      },
    ]),
  );

  await writeFile(ctx.outputPath, '');

  const exitCode = await writeSyncEntries({
    cwd: ctx.directory,
    skip: 'workflow-demo',
    include: 'workflow-demo',
    outputPath: ctx.outputPath,
    fileSystem: nodeFileSystem,
    writeOutput: ctx.writeOutput,
  });

  const outputs = await readFile(ctx.outputPath, 'utf8');

  expect(exitCode).toBe(1);
  expect(outputs).toBe('');
  expect(ctx.output).toStrictEqual(['::error::skip and include both list: workflow-demo\n']);
});

test.each([
  ['an object in place of a list', { name: 'editorconfig' }],
  ['an entry with no description', [{ name: 'editorconfig', files: [] }]],
])('it fails with an error when the manifest holds %s', async (_label, manifest) => {
  const ctx = await setupTest();

  await writeFile(ctx.manifestPath, JSON.stringify(manifest));
  await writeFile(ctx.outputPath, '');

  const exitCode = await writeSyncEntries({
    cwd: ctx.directory,
    skip: '',
    include: '',
    outputPath: ctx.outputPath,
    fileSystem: nodeFileSystem,
    writeOutput: ctx.writeOutput,
  });

  const outputs = await readFile(ctx.outputPath, 'utf8');

  expect(exitCode).toBe(1);
  expect(outputs).toBe('');

  expect(ctx.output).toStrictEqual([
    '::error::sync/manifest.json holds no list of valid entries\n',
  ]);
});
