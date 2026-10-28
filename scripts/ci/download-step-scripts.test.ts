import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubFileServer } from '../../test-utils/create-stub-file-server.ts';
import { makeAnswerQueue } from '../../test-utils/make-answer-queue.ts';
import { writeTreeFiles } from '../../test-utils/write-tree-files.ts';
import {
  downloadStepScripts,
  isToolsURL,
  makeToolsFileReader,
  parseDownloadArgs,
  readURL,
  runDownloadStep,
  stepScriptSets,
} from './download-step-scripts.ts';
import type { URLOutcome } from './download-step-scripts.ts';
import { nodeFileSystem } from './node-file-system.ts';

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
    writeFile: nodeFileSystem.writeText,
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
    writeFile: nodeFileSystem.writeText,
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
    writeFile: nodeFileSystem.writeText,
  });

  expect(downloading).rejects.toThrow(
    'scripts/kettle/boil.ts imports the package ts-pattern, which a downloaded step script cannot install',
  );
});

test('it reads each file at the tools URL and waits the retry delay after each passing fault', async () => {
  const answerURL = makeAnswerQueue<URLOutcome>([
    { kind: 'failed', reason: 'HTTP 503' },
    { kind: 'failed', reason: 'HTTP 429' },
    { kind: 'read', text: '// boil\n' },
  ]);

  const urls: string[] = [];
  const waits: number[] = [];

  const readToolsFile = makeToolsFileReader({
    toolsURL: 'https://raw.example/acme/tools/cafe12',
    attempts: 3,
    retryDelayMs: 2000,
    readURL: (url) => {
      urls.push(url);

      return Promise.resolve(answerURL());
    },
    wait: (delayMs) => {
      waits.push(delayMs);

      return Promise.resolve();
    },
  });

  const text = await readToolsFile('scripts/kettle/boil.ts');

  expect(text).toBe('// boil\n');

  expect(urls).toStrictEqual(
    Array.from({ length: 3 }, () => 'https://raw.example/acme/tools/cafe12/scripts/kettle/boil.ts'),
  );

  expect(waits).toStrictEqual([2000, 2000]);
});

test('it fails at once, with no wait, on a file the tools commit lacks', () => {
  const waits: number[] = [];

  const readToolsFile = makeToolsFileReader({
    toolsURL: 'https://raw.example/acme/tools/cafe12',
    attempts: 3,
    retryDelayMs: 2000,
    readURL: () => Promise.resolve({ kind: 'refused', reason: 'HTTP 404' }),
    wait: (delayMs) => {
      waits.push(delayMs);

      return Promise.resolve();
    },
  });

  expect(readToolsFile('scripts/kettle/boil.ts')).rejects.toThrow(
    'could not download https://raw.example/acme/tools/cafe12/scripts/kettle/boil.ts: HTTP 404',
  );

  expect(waits).toStrictEqual([]);
});

test('it fails once every attempt meets a passing fault', () => {
  const urls: string[] = [];

  const readToolsFile = makeToolsFileReader({
    toolsURL: 'https://raw.example/acme/tools/cafe12',
    attempts: 2,
    retryDelayMs: 0,
    readURL: (url) => {
      urls.push(url);

      return Promise.resolve({ kind: 'failed', reason: 'HTTP 502' });
    },
    wait: () => Promise.resolve(),
  });

  expect(readToolsFile('scripts/kettle/boil.ts')).rejects.toThrow('HTTP 502');
  expect(urls).toHaveLength(2);
});

test.each([
  [200, { kind: 'read', text: 'served' }],
  [404, { kind: 'refused', reason: 'HTTP 404' }],
  [429, { kind: 'failed', reason: 'HTTP 429' }],
  [503, { kind: 'failed', reason: 'HTTP 503' }],
])('it reads an HTTP %p answer as %p', async (status, expected) => {
  const server = createStubFileServer({ '/boil.ts': [{ status, body: 'served' }] });

  const outcome: unknown = await readURL(`${server.url}/boil.ts`);

  expect(outcome).toStrictEqual(expected);
});

test('it reads a refused connection as a passing fault', async () => {
  const outcome = await readURL('http://localhost:1/boil.ts');

  expect(outcome).toMatchObject({ kind: 'failed' });
});

test.each([
  ['a known set', ['bun-checks'], { kind: 'parsed', set: 'bun-checks' }],
  [
    'an unknown set',
    ['kettle'],
    {
      kind: 'refused',
      message: expect.toStartWith('usage: download-step-scripts.ts <bun-checks|'),
    },
  ],
  [
    'a second set',
    ['bun-checks', 'release'],
    { kind: 'refused', message: expect.toStartWith('usage:') },
  ],
  [
    'an unknown option',
    ['bun-checks', '--unknown'],
    { kind: 'refused', message: expect.toStartWith("Unknown option '--unknown'") },
  ],
])('it reads %s from the arguments', (_label, args, expected) => {
  const parsed: unknown = parseDownloadArgs(args);

  expect(parsed).toStrictEqual(expected);
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
      writeFile: nodeFileSystem.writeText,
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

test('it fails the step and downloads nothing when TOOLS_URL names no commit', async () => {
  const urls: string[] = [];
  const written: string[] = [];
  const output: string[] = [];

  const exitCode = await runDownloadStep({
    args: ['paths-changed'],
    env: { TOOLS_URL: 'https://raw.githubusercontent.com/acme/tools/', RUNNER_TEMP: '/runner' },
    readURL: (url) => {
      urls.push(url);

      return Promise.resolve({ kind: 'read', text: '' });
    },
    wait: () => Promise.resolve(),
    writeFile: (path) => {
      written.push(path);

      return Promise.resolve();
    },
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      output.push(text);
    },
  });

  expect(exitCode).toBe(1);
  expect(urls).toStrictEqual([]);
  expect(written).toStrictEqual([]);

  expect(output).toStrictEqual([
    "::error::the download needs TOOLS_URL, raw.githubusercontent.com/<owner>/<repo>/<commit sha>, and RUNNER_TEMP; TOOLS_URL is 'https://raw.githubusercontent.com/acme/tools/'\n",
  ]);
});

test('it fails the step and downloads nothing when the runner gives no RUNNER_TEMP', async () => {
  const urls: string[] = [];

  const exitCode = await runDownloadStep({
    args: ['paths-changed'],
    env: { TOOLS_URL: `https://raw.githubusercontent.com/acme/tools/${'a1'.repeat(20)}` },
    readURL: (url) => {
      urls.push(url);

      return Promise.resolve({ kind: 'read', text: '' });
    },
    wait: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    writeOutput: () => {},
    writeError: () => {},
  });

  expect(exitCode).toBe(1);
  expect(urls).toStrictEqual([]);
});

test('it refuses an unknown set with the usage and downloads nothing', async () => {
  const urls: string[] = [];
  const errors: string[] = [];

  const exitCode = await runDownloadStep({
    args: ['kettle'],
    env: {
      TOOLS_URL: `https://raw.githubusercontent.com/acme/tools/${'a1'.repeat(20)}`,
      RUNNER_TEMP: '/runner',
    },
    readURL: (url) => {
      urls.push(url);

      return Promise.resolve({ kind: 'read', text: '' });
    },
    wait: () => Promise.resolve(),
    writeFile: () => Promise.resolve(),
    writeOutput: () => {},
    writeError: (text) => {
      errors.push(text);
    },
  });

  expect(exitCode).toBe(2);
  expect(urls).toStrictEqual([]);

  expect(errors).toStrictEqual([
    expect.toStartWith('usage: download-step-scripts.ts <bun-checks|'),
  ]);
});

test('it downloads the set from the tools commit into the runner folder', async () => {
  const toolsURL = `https://raw.githubusercontent.com/acme/tools/${'a1'.repeat(20)}`;
  const root = join(import.meta.dir, '../..');
  const written: string[] = [];
  const output: string[] = [];

  const exitCode = await runDownloadStep({
    args: ['paths-changed'],
    env: { TOOLS_URL: toolsURL, RUNNER_TEMP: '/runner' },
    readURL: async (url) => {
      const text = await readFile(join(root, url.slice(toolsURL.length + 1)), 'utf8');

      return { kind: 'read', text };
    },
    wait: () => Promise.resolve(),
    writeFile: (path) => {
      written.push(path);

      return Promise.resolve();
    },
    writeOutput: (text) => {
      output.push(text);
    },
    writeError: (text) => {
      output.push(text);
    },
  });

  expect(exitCode).toBe(0);
  expect(written).toContain('/runner/tools/scripts/paths-changed/match-changed-files.ts');
  expect(output).toStrictEqual([`downloaded ${written.length} files from ${toolsURL}\n`]);
});
