import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubFileServer } from '../../test-utils/create-stub-file-server.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import {
  downloadStepScripts,
  isToolsURL,
  makeToolsFileReader,
  stepScriptSets,
} from './download-step-scripts.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-download-step-scripts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const source = join(directory, 'source');
  const destination = join(directory, 'destination');
  const readSourceFile = (path: string) => readFile(join(source, path), 'utf8');

  return { source, destination, readSourceFile };
}

test('it writes each entry and every file it imports at its repo path under the destination', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.source, {
    'scripts/kettle/boil.ts': [
      "import { $ } from 'bun';",
      "import { readFile } from 'node:fs/promises';",
      "import type { Kettle } from './types.ts';",
      "import { pour } from '../../sync/cup/pour.ts';",
      '',
    ].join('\n'),
    'scripts/kettle/types.ts': 'export interface Kettle {}\n',
    'sync/cup/pour.ts': "export { fill as pour } from './fill.ts';\n",
    'sync/cup/fill.ts': 'export const fill = 1;\n',
    'scripts/kettle/whistle.sh': "#!/usr/bin/env bash\nimport './not-a-module.ts'\n",
  });

  const written = await downloadStepScripts({
    entries: ['scripts/kettle/boil.ts', 'scripts/kettle/whistle.sh'],
    destination: ctx.destination,
    readToolsFile: ctx.readSourceFile,
  });

  const fill = await readFile(join(ctx.destination, 'sync/cup/fill.ts'), 'utf8');

  expect(written).toStrictEqual([
    'scripts/kettle/boil.ts',
    'scripts/kettle/whistle.sh',
    'sync/cup/pour.ts',
    'sync/cup/fill.ts',
  ]);

  expect(fill).toBe('export const fill = 1;\n');
});

test('it downloads a file that two files import once', async () => {
  const ctx = await setupTest();

  const read: string[] = [];

  await writeTreeFiles(ctx.source, {
    'scripts/kettle/boil.ts': "import './shared.ts';\nimport './pour.ts';\n",
    'scripts/kettle/pour.ts': "import './shared.ts';\n",
    'scripts/kettle/shared.ts': 'export {};\n',
  });

  await downloadStepScripts({
    entries: ['scripts/kettle/boil.ts'],
    destination: ctx.destination,
    readToolsFile: (path) => {
      read.push(path);

      return ctx.readSourceFile(path);
    },
  });

  expect(read).toStrictEqual([
    'scripts/kettle/boil.ts',
    'scripts/kettle/shared.ts',
    'scripts/kettle/pour.ts',
  ]);
});

test('it refuses a step script that imports a package, which no caller installs', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.source, {
    'scripts/kettle/boil.ts': "import { match } from 'ts-pattern';\n",
  });

  const downloading = downloadStepScripts({
    entries: ['scripts/kettle/boil.ts'],
    destination: ctx.destination,
    readToolsFile: ctx.readSourceFile,
  });

  expect(downloading).rejects.toThrow(
    'scripts/kettle/boil.ts imports the package ts-pattern, which a downloaded step script cannot install',
  );
});

test('it reads each file from the tools URL and tries again after a server fault', async () => {
  const server = createStubFileServer({
    '/acme/tools/cafe12/scripts/kettle/boil.ts': [
      { status: 503, body: 'busy' },
      { status: 429, body: 'slow down' },
      { status: 200, body: '// boil\n' },
    ],
  });

  const readToolsFile = makeToolsFileReader({
    toolsURL: `${server.url}/acme/tools/cafe12`,
    attempts: 3,
    retryDelayMs: 0,
  });

  const text = await readToolsFile('scripts/kettle/boil.ts');

  expect(text).toBe('// boil\n');
  expect(server.requests).toHaveLength(3);
});

test('it fails at once on a file the tools commit lacks', () => {
  const server = createStubFileServer({
    '/acme/tools/cafe12/scripts/kettle/boil.ts': [
      { status: 404, body: 'missing' },
      { status: 200, body: '// boil\n' },
    ],
  });

  const readToolsFile = makeToolsFileReader({
    toolsURL: `${server.url}/acme/tools/cafe12`,
    attempts: 3,
    retryDelayMs: 0,
  });

  expect(readToolsFile('scripts/kettle/boil.ts')).rejects.toThrow(
    `could not download ${server.url}/acme/tools/cafe12/scripts/kettle/boil.ts: HTTP 404`,
  );

  expect(server.requests).toHaveLength(1);
});

test('it fails once every attempt meets a server fault', () => {
  const server = createStubFileServer({
    '/acme/tools/cafe12/scripts/kettle/boil.ts': [{ status: 502, body: 'bad gateway' }],
  });

  const readToolsFile = makeToolsFileReader({
    toolsURL: `${server.url}/acme/tools/cafe12`,
    attempts: 2,
    retryDelayMs: 0,
  });

  expect(readToolsFile('scripts/kettle/boil.ts')).rejects.toThrow('HTTP 502');
  expect(server.requests).toHaveLength(2);
});

test.each([
  ['a commit sha', `https://raw.githubusercontent.com/acme/tools/${'a1'.repeat(20)}`, true],
  [
    'no commit, from a job context that lacks it',
    'https://raw.githubusercontent.com/acme/tools/',
    false,
  ],
  ['a branch in place of the commit', 'https://raw.githubusercontent.com/acme/tools/main', false],
  ['another host', `https://example.com/acme/tools/${'a1'.repeat(20)}`, false],
])('it reads a tools URL with %s as %p', (_label, url, expected) => {
  expect(isToolsURL(url)).toBe(expected);
});

test.each(Object.entries(stepScriptSets))(
  'it downloads the %s scripts from this commit with every file they import',
  async (_name, entries) => {
    const ctx = await setupTest();

    const root = join(import.meta.dir, '../..');

    await downloadStepScripts({
      entries,
      destination: ctx.destination,
      readToolsFile: (path) => readFile(join(root, path), 'utf8'),
    });

    const build = await Bun.build({
      entrypoints: entries
        .filter((entry) => entry.endsWith('.ts'))
        .map((entry) => join(ctx.destination, entry)),
      target: 'bun',
      throw: false,
    });

    expect(build.logs).toStrictEqual([]);
    expect(build.success).toBeTrue();
  },
);
