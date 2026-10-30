import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCommandStub } from '../../test-utils/build-command-stub.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import { writeSyncRef } from './write-sync-ref.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-write-sync-ref-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const outputPath = join(directory, 'output');
  const commands = buildCommandStub();
  const output: string[] = [];

  await writeFile(outputPath, '');

  const resolve = (ref: string, workflowCommit: string) =>
    writeSyncRef({
      cwd: directory,
      env: {},
      ref,
      workflowCommit,
      outputPath,
      fileSystem: nodeFileSystem,
      runCommand: commands.runCommand,
      writeOutput: (text) => {
        output.push(text);
      },
    });

  const readOutputs = () => readFile(outputPath, 'utf8');

  return { commands, output, resolve, readOutputs };
}

test('it syncs the commit a dispatch named without asking GitHub', async () => {
  const ctx = await setupTest();

  await ctx.resolve(
    '3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e',
    '0123456789abcdef0123456789abcdef01234567',
  );

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe('ref=3f9c2e1a7b0d4c6e8f1a2b3c4d5e6f7a8b9c0d1e\n');
  expect(ctx.commands.calls).toStrictEqual([]);
});

test('it syncs the newest commit whose Main push run on main passed when no dispatch named one', async () => {
  const ctx = await setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'GET',
      'repos/zgeoff/tools/actions/workflows/main.yml/runs',
      '-f',
      'branch=main',
      '-f',
      'event=push',
      '-f',
      'status=success',
      '-f',
      'per_page=1',
      '--jq',
      '.workflow_runs[0].head_sha // empty',
    ],
    { exitCode: 0, stdout: 'fedcba9876543210fedcba9876543210fedcba98\n', stderr: '' },
  );

  await ctx.resolve('', '0123456789abcdef0123456789abcdef01234567');

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe('ref=fedcba9876543210fedcba9876543210fedcba98\n');
});

test('it warns and syncs the pinned commit when GitHub cannot name the newest green commit', async () => {
  const ctx = await setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'GET',
      'repos/zgeoff/tools/actions/workflows/main.yml/runs',
      '-f',
      'branch=main',
      '-f',
      'event=push',
      '-f',
      'status=success',
      '-f',
      'per_page=1',
      '--jq',
      '.workflow_runs[0].head_sha // empty',
    ],
    { exitCode: 1, stdout: '', stderr: 'gh: Bad credentials (HTTP 401)\n' },
  );

  const exitCode = await ctx.resolve('', '0123456789abcdef0123456789abcdef01234567');
  const outputs = await ctx.readOutputs();

  expect(exitCode).toBe(0);
  expect(outputs).toBe('ref=0123456789abcdef0123456789abcdef01234567\n');

  expect(ctx.output).toStrictEqual([
    '::warning::Cannot read the newest green commit of zgeoff/tools, so the run syncs the pinned 0123456789abcdef0123456789abcdef01234567: gh: Bad credentials (HTTP 401)\n',
  ]);
});

test('it syncs the pinned commit when main has no green run', async () => {
  const ctx = await setupTest();

  ctx.commands.answer(
    [
      'gh',
      'api',
      '-X',
      'GET',
      'repos/zgeoff/tools/actions/workflows/main.yml/runs',
      '-f',
      'branch=main',
      '-f',
      'event=push',
      '-f',
      'status=success',
      '-f',
      'per_page=1',
      '--jq',
      '.workflow_runs[0].head_sha // empty',
    ],
    { exitCode: 0, stdout: '', stderr: '' },
  );

  await ctx.resolve('', '0123456789abcdef0123456789abcdef01234567');

  const outputs = await ctx.readOutputs();

  expect(outputs).toBe('ref=0123456789abcdef0123456789abcdef01234567\n');
});
