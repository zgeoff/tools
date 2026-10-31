import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStreamUntil } from '../../../../test-utils/read-stream-until.ts';
import { buildRecordedCommand } from './build-recorded-command.ts';
import { processGroups } from './process-groups.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), 'recorded-command-'));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  const groupsDir = join(directory, 'groups');

  return { groupsDir, pendingRecord: join(groupsDir, 'pending-tests'), stack };
}

test('it moves the pending record to the group ID before the command runs, as the group leader', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.pendingRecord, { recursive: true });

  const command = buildRecordedCommand(ctx.groupsDir, ctx.pendingRecord, [
    '/bin/sh',
    '-c',
    'echo "records $(ls "$0") as $$"; exec sleep 30',
    ctx.groupsDir,
  ]);

  const leader = Bun.spawn([...command], { stdout: 'pipe', detached: true });

  ctx.stack.defer(async () => {
    if (leader.exitCode === null && leader.signalCode === null) {
      processGroups.signalGroup(leader.pid, 'SIGKILL');
    }

    await leader.exited;
  });

  const output = await readStreamUntil(leader.stdout, '\n');

  expect(output).toBe(`records ${leader.pid} as ${leader.pid}\n`);
});

test('it returns the exit code of the command', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.pendingRecord, { recursive: true });

  const command = buildRecordedCommand(ctx.groupsDir, ctx.pendingRecord, [
    '/bin/sh',
    '-c',
    'exit 3',
  ]);

  const leader = Bun.spawn([...command], { detached: true });

  ctx.stack.defer(async () => {
    if (leader.exitCode === null && leader.signalCode === null) {
      processGroups.signalGroup(leader.pid, 'SIGKILL');
    }

    await leader.exited;
  });

  const exitCode = await leader.exited;

  expect(exitCode).toBe(3);
});

test('it runs nothing, and records nothing, when a sweep removed the pending record first', async () => {
  const ctx = await setupTest();

  await mkdir(ctx.groupsDir);

  const command = buildRecordedCommand(ctx.groupsDir, ctx.pendingRecord, [
    '/bin/sh',
    '-c',
    'echo ran',
  ]);

  const leader = Bun.spawn([...command], { stdout: 'pipe', stderr: 'ignore', detached: true });

  const exitCode = await leader.exited;

  const output = await new Response(leader.stdout).text();

  const records = await readdir(ctx.groupsDir);

  expect(exitCode).not.toBe(0);
  expect(output).toBe('');
  expect(records).toStrictEqual([]);
});
