import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createStubInstall } from './create-stub-install.ts';
import { readRunFolderPrefix } from './read-run-folder-prefix.ts';
import { readStreamUntil } from './read-stream-until.ts';

async function setupTest() {
  const directory = await mkdtemp(
    join(import.meta.dir, readRunFolderPrefix('.test-create-stub-install-')),
  );

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const bin = join(directory, 'bin');
  const project = join(directory, 'project');

  await mkdir(bin);
  await mkdir(project);

  return { directory, bin, project };
}

test('it logs the call and links the package into node_modules', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'install.log');
  const packageDirectory = join(ctx.directory, 'ledger');

  await createStubInstall(ctx.bin, {
    log,
    outcome: { kind: 'links', packageName: '@acme/ledger', packageDirectory },
  });

  const install = Bun.spawnSync([join(ctx.bin, 'bun'), 'install', '--frozen-lockfile'], {
    cwd: ctx.project,
  });

  expect(install.exitCode).toBe(0);
  expect(install.stderr.toString()).toBe('stub install started\n');

  const target = await readlink(join(ctx.project, 'node_modules/@acme/ledger'));
  const calls = await readFile(log, 'utf8');

  expect(target).toBe(packageDirectory);
  expect(calls).toBe(`bun install --frozen-lockfile in ${ctx.project}\n`);
});

test('it logs the call and fails with no node_modules', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'install.log');

  await createStubInstall(ctx.bin, { log, outcome: { kind: 'fails' } });

  const install = Bun.spawnSync([join(ctx.bin, 'bun'), 'install'], { cwd: ctx.project });

  expect(install.exitCode).toBe(1);

  const nodeModulesExists = await Bun.file(join(ctx.project, 'node_modules')).exists();
  const calls = await readFile(log, 'utf8');

  expect(nodeModulesExists).toBeFalse();
  expect(calls).toBe(`bun install in ${ctx.project}\n`);
});

test('it logs the call and stops on SIGKILL', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'install.log');

  await createStubInstall(ctx.bin, { log, outcome: { kind: 'killed' } });

  const install = Bun.spawnSync([join(ctx.bin, 'bun'), 'install'], { cwd: ctx.project });

  expect({ success: install.success, signalCode: install.signalCode }).toStrictEqual({
    success: false,
    signalCode: 'SIGKILL',
  });

  const calls = await readFile(log, 'utf8');

  expect(calls).toBe(`bun install in ${ctx.project}\n`);
});

test('it logs the call, removes the path and fails', async () => {
  const ctx = await setupTest();

  const log = join(ctx.directory, 'install.log');
  const doomed = join(ctx.directory, 'ledger.bin');

  await writeFile(doomed, 'ledger');
  await createStubInstall(ctx.bin, { log, outcome: { kind: 'removes', path: doomed } });

  const install = Bun.spawnSync([join(ctx.bin, 'bun'), 'install'], { cwd: ctx.project });

  expect(install.exitCode).toBe(1);

  const doomedExists = await Bun.file(doomed).exists();
  const calls = await readFile(log, 'utf8');

  expect(doomedExists).toBeFalse();
  expect(calls).toBe(`bun install in ${ctx.project}\n`);
});

test('it links the package only once the release path exists', async () => {
  const ctx = await setupTest();

  const releasePath = join(ctx.directory, 'release');
  const packageDirectory = join(ctx.directory, 'ledger');

  await createStubInstall(ctx.bin, {
    log: join(ctx.directory, 'install.log'),
    outcome: { kind: 'links', packageName: 'ledger', packageDirectory },
    releasePath,
  });

  const install = Bun.spawn([join(ctx.bin, 'bun'), 'install'], {
    cwd: ctx.project,
    stderr: 'pipe',
    detached: true,
  });

  // A test that fails before it releases the install leaves its wait loop running, so the cleanup
  // stops the whole process group, which detached gives the install.
  onTestFinished(() => {
    Bun.spawnSync(['kill', '-KILL', '--', `-${install.pid}`]);
  });

  await readStreamUntil(install.stderr, 'stub install started');

  const linkedBeforeRelease = await Bun.file(join(ctx.project, 'node_modules/ledger')).exists();

  await writeFile(releasePath, '');

  const exitCode = await install.exited;
  const target = await readlink(join(ctx.project, 'node_modules/ledger'));

  expect(linkedBeforeRelease).toBeFalse();
  expect(exitCode).toBe(0);
  expect(target).toBe(packageDirectory);
});
