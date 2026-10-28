import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubFileServer } from '../../test-utils/create-stub-file-server.ts';
import { nodeFileSystem } from './node-file-system.ts';
import { runCommand } from './run-command.ts';
import { runPinnedToolStep } from './run-pinned-tool-step.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-pinned-tool-step-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const runnerTemp = join(directory, 'runner');
  const githubPath = join(directory, 'github-path');

  await mkdir(runnerTemp);

  return { directory, runnerTemp, githubPath };
}

test.each([
  ['a test job', 'test', 'false'],
  ['a lane job', 'lane', 'false'],
])(
  'it downloads nothing for %s whose caller does not ask for the tool',
  async (_label, part, requested) => {
    const ctx = await setupTest();

    const server = createStubFileServer({ '/shfmt': [{ status: 200, body: 'fake shfmt\n' }] });

    const result = await runPinnedToolStep({
      args: ['shfmt'],
      env: {
        ...process.env,
        PART: part,
        SETUP_TOOL: requested,
        RUNNER_TEMP: ctx.runnerTemp,
        GITHUB_PATH: ctx.githubPath,
      },
      pins: {
        shfmt: {
          url: `${server.url}/shfmt`,
          sha256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
          packaging: 'binary',
          neededBy: 'shell check',
        },
      },
      fileSystem: nodeFileSystem,
      runCommand,
    });

    const runnerFiles = await readdir(ctx.runnerTemp);

    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('shfmt: not needed, because this job runs no shell check\n');
    expect(server.requests).toStrictEqual([]);
    expect(runnerFiles).toStrictEqual([]);
  },
);

test.each([
  ['the static job', 'static', 'false'],
  ['a test job whose caller asks for it', 'test', 'true'],
])('it installs the tool from the step for %s', async (_label, part, requested) => {
  const ctx = await setupTest();

  const server = createStubFileServer({ '/shfmt': [{ status: 200, body: 'fake shfmt\n' }] });

  const result = await runPinnedToolStep({
    args: ['shfmt'],
    env: {
      ...process.env,
      PART: part,
      SETUP_TOOL: requested,
      RUNNER_TEMP: ctx.runnerTemp,
      GITHUB_PATH: ctx.githubPath,
    },
    pins: {
      shfmt: {
        url: `${server.url}/shfmt`,
        sha256: new Bun.CryptoHasher('sha256').update('fake shfmt\n').digest('hex'),
        packaging: 'binary',
        neededBy: 'shell check',
      },
    },
    fileSystem: nodeFileSystem,
    runCommand,
  });

  const installed = await readFile(join(ctx.runnerTemp, 'shfmt-bin/shfmt'), 'utf8');

  expect(result.exitCode).toBe(0);
  expect(result.output).toBe('');
  expect(installed).toBe('fake shfmt\n');
});

test('it fails the step with an error when the runner gives no RUNNER_TEMP or GITHUB_PATH', async () => {
  const result = await runPinnedToolStep({
    args: ['shfmt'],
    env: { PATH: process.env['PATH'], PART: 'static' },
    pins: {
      shfmt: {
        url: 'http://localhost:1/shfmt',
        sha256: '0'.repeat(64),
        packaging: 'binary',
        neededBy: 'shell check',
      },
    },
    fileSystem: nodeFileSystem,
    runCommand,
  });

  expect(result.exitCode).toBe(1);
  expect(result.output).toBe('::error::shfmt: the install needs RUNNER_TEMP and GITHUB_PATH\n');
});
