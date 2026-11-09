import { expect, onTestFinished, test } from 'bun:test';
import { readlinkSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/testing/helpers';
import { $ } from 'bun';
import { readPIDNamespace } from './read-pid-namespace.ts';
import { runTestFolderSweep } from './run-test-folder-sweep.ts';

async function setupTest() {
  const temp = await mkdtemp(join(tmpdir(), readRunFolderPrefix('test-folder-sweep-')));

  // A test makes a folder in it unreadable or read-only, so the cleanup gives the owner its
  // access back first.
  onTestFinished(async () => {
    await $`chmod -R u+rwx ${temp}`.nothrow().quiet();

    await rm(temp, { recursive: true, force: true });
  });

  const namespace = readPIDNamespace({ platform: process.platform, readLink: readlinkSync });
  const removed: string[] = [];
  const failures: string[] = [];

  return {
    temp,
    namespace,
    removed,
    failures,
    removePath: (path: string) => {
      removed.push(path);

      return Promise.resolve();
    },
    reportFailure: (path: string) => {
      failures.push(path);
    },
  };
}

test('it removes the temp folders of a stopped test process and returns them', async () => {
  const ctx = await setupTest();

  const swept = await runTestFolderSweep({
    readCandidatePaths: () =>
      Promise.resolve([
        '/scratch/kettle-pid4100-ns7001-Ab12Cd',
        '/scratch/kettle-pid4200-ns7001-Ef34Gh',
      ]),
    namespace: '7001',
    isRunning: (pid) => pid === 4200,
    removePath: ctx.removePath,
    reportFailure: ctx.reportFailure,
  });

  expect(swept).toStrictEqual(['/scratch/kettle-pid4100-ns7001-Ab12Cd']);
  expect(ctx.removed).toStrictEqual(['/scratch/kettle-pid4100-ns7001-Ab12Cd']);
});

test('it never removes the files of a run that is still going', async () => {
  const ctx = await setupTest();

  await runTestFolderSweep({
    readCandidatePaths: () => Promise.resolve(['/scratch/kettle-pid4200-ns7001-Ef34Gh']),
    namespace: '7001',
    isRunning: () => true,
    removePath: ctx.removePath,
    reportFailure: ctx.reportFailure,
  });

  expect(ctx.removed).toStrictEqual([]);
});

test('it reports a folder it cannot remove and goes on with the rest', async () => {
  const ctx = await setupTest();

  const swept = await runTestFolderSweep({
    readCandidatePaths: () =>
      Promise.resolve([
        '/scratch/kettle-pid4100-ns7001-Ab12Cd',
        '/scratch/kettle-pid4300-ns7001-Kl78Mn',
      ]),
    namespace: '7001',
    isRunning: () => false,
    removePath: (path) =>
      path.includes('pid4100')
        ? Promise.reject(new Error('EACCES: permission denied'))
        : ctx.removePath(path),
    reportFailure: ctx.reportFailure,
  });

  expect(swept).toStrictEqual(['/scratch/kettle-pid4300-ns7001-Kl78Mn']);
  expect(ctx.failures).toStrictEqual(['/scratch/kettle-pid4100-ns7001-Ab12Cd']);
});

test('it removes the temp folder of an exited process and keeps a live or foreign-namespace one when run as a script', async () => {
  const ctx = await setupTest();

  const exited = Bun.spawn(['true']);

  await exited.exited;
  await mkdir(join(ctx.temp, `kettle-pid${exited.pid}-ns${ctx.namespace}-Ab12Cd`));
  await mkdir(join(ctx.temp, `kettle-pid${process.pid}-ns${ctx.namespace}-Ef34Gh`));
  await mkdir(join(ctx.temp, `kettle-pid${exited.pid}-ns1-Gh56Ij`));

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
    .env({ ...process.env, TMPDIR: ctx.temp })
    .nothrow()
    .quiet();

  const names = await readdir(ctx.temp);

  expect(result.exitCode).toBe(0);

  expect(names).toIncludeSameMembers([
    `kettle-pid${exited.pid}-ns1-Gh56Ij`,
    `kettle-pid${process.pid}-ns${ctx.namespace}-Ef34Gh`,
  ]);
});

test.if(process.getuid?.() !== 0)(
  'it keeps a folder it cannot remove, says so, and exits 0 when run as a script',
  async () => {
    const ctx = await setupTest();

    const exited = Bun.spawn(['true']);

    await exited.exited;

    const stuck = join(ctx.temp, `kettle-pid${exited.pid}-ns${ctx.namespace}-Op90Qr`);

    await mkdir(join(stuck, 'locked'), { recursive: true });
    await writeFile(join(stuck, 'locked', 'lid.txt'), 'lid');
    await chmod(join(stuck, 'locked'), 0o500);

    const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
      .env({ ...process.env, TMPDIR: ctx.temp })
      .nothrow()
      .quiet();

    const names = await readdir(ctx.temp);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toInclude(`test-folder-sweep: kept ${stuck}`);
    expect(names).toStrictEqual([basename(stuck)]);
  },
);

test.if(process.getuid?.() !== 0)(
  'it says so when it cannot read the temp folder, and exits 0 when run as a script',
  async () => {
    const ctx = await setupTest();

    await chmod(ctx.temp, 0o000);

    const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
      .env({ ...process.env, TMPDIR: ctx.temp })
      .nothrow()
      .quiet();

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toInclude(`test-folder-sweep: skipped ${ctx.temp}`);
  },
);

test("it removes an ignored repo folder of an exited process and keeps a live one's when run as a script", async () => {
  const ctx = await setupTest();

  const repo = join(ctx.temp, 'repo');
  const emptyTemp = join(ctx.temp, 'empty-temp');

  const gitFreeEnv = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')),
  );

  await mkdir(emptyTemp);
  await mkdir(repo);

  await $`git init --quiet`.cwd(repo).env(gitFreeEnv).quiet();

  await writeFile(join(repo, '.gitignore'), '.test-*\n');

  const exited = Bun.spawn(['true']);

  await exited.exited;
  await mkdir(join(repo, `.test-kettle-pid${exited.pid}-ns${ctx.namespace}-Ab12Cd`));
  await mkdir(join(repo, `.test-kettle-pid${process.pid}-ns${ctx.namespace}-Ef34Gh`));

  const result = await $`${process.execPath} ${join(import.meta.dir, 'run-test-folder-sweep.ts')}`
    .cwd(repo)
    .env({ ...gitFreeEnv, TMPDIR: emptyTemp })
    .nothrow()
    .quiet();

  const names = await readdir(repo);

  expect(result.exitCode).toBe(0);

  expect(names).toIncludeSameMembers([
    '.git',
    '.gitignore',
    `.test-kettle-pid${process.pid}-ns${ctx.namespace}-Ef34Gh`,
  ]);
});
