import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import invariant from 'tiny-invariant';
import { findBrowserRun } from './find-browser-run.ts';
import { readProcessTable } from './read-process-table.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('browser-preload-')));

  onTestFinished(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return { directory };
}

test("it starts Chrome on a profile folder inside the run's folder", async () => {
  const run = findBrowserRun(process.cwd(), hostname(), process.env);

  invariant(run);

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  const profiles = await readdir(run.profilesDir);

  const profileEntries = await Promise.all(
    profiles.map((profile) => readdir(join(run.profilesDir, profile))),
  );

  expect(profileEntries).toSatisfyAny((entries: readonly string[]) => entries.length > 0);
});

test('it runs the file under the TMPDIR the lane picks for Chrome', () => {
  expect(process.env['TMPDIR']).toMatch(/\/rig-browser-\d+\/[\da-f]{8}\/\d+$/u);
});

test('it stops the processes of the shared Chrome after the last file, before the test process exits', async () => {
  const ctx = await setupTest();

  const files = ['first', 'second'].map((name) => join(ctx.directory, `${name}.test.ts`));

  await Promise.all(
    files.map((file) =>
      writeFile(
        file,
        `import { test } from 'bun:test';
import { collectDescendantPIDs } from ${JSON.stringify(join(import.meta.dir, 'collect-descendant-pids.ts'))};
import { readProcessTable } from ${JSON.stringify(join(import.meta.dir, 'read-process-table.ts'))};

test('it opens a view', async () => {
  const view = new Bun.WebView({ backend: 'chrome' });

  await view.navigate('about:blank');
  view.close();

  await Bun.write(${JSON.stringify(`${file}.pids.json`)}, JSON.stringify(collectDescendantPIDs(readProcessTable() ?? [], process.pid)));
});
`,
      ),
    ),
  );

  const tests = Bun.spawn(
    [
      process.execPath,
      'test',
      '--parallel=1',
      '--randomize',
      '--no-isolate',
      '--preload',
      join(import.meta.dir, 'browser-preload.ts'),
      ...files,
    ],
    { cwd: process.cwd(), env: process.env, stdout: 'pipe', stderr: 'pipe' },
  );

  const exitCode = await tests.exited;

  const listing = readProcessTable();

  const recorded = await Promise.all(
    files.map((file): Promise<unknown> => Bun.file(`${file}.pids.json`).json()),
  );

  const chromePIDs = recorded.flat();

  expect(exitCode).toBe(0);
  expect(chromePIDs).not.toBeEmpty();
  expect(listing?.filter((entry) => chromePIDs.includes(entry.pid))).toStrictEqual([]);
});
