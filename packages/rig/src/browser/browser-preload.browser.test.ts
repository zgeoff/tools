import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunFolderPrefix } from '@zgeoff/std/test-utils/read-run-folder-prefix';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { stopProcessGroups } from '../test-utils/stop-process-groups.ts';
import { testProcesses } from '../test-utils/test-processes.ts';
import { findBrowserRun } from './find-browser-run.ts';
import { isZombieState } from './is-zombie-state.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('browser-preload-')));

  stack.defer(() => rm(directory, { recursive: true, force: true }));

  return { directory, stack };
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

  const collectorPath = JSON.stringify(join(import.meta.dir, 'collect-descendant-pids.ts'));
  const tablePath = JSON.stringify(join(import.meta.dir, 'read-process-table.ts'));
  const files = ['first', 'second'].map((name) => join(ctx.directory, `${name}.test.ts`));
  const recorder = join(ctx.directory, 'record-after-stop.ts');
  const afterStopPath = join(ctx.directory, 'after-stop.json');

  await Promise.all(
    files.map((file) =>
      writeFile(
        file,
        `import { onTestFinished, test } from 'bun:test';
import { collectDescendantPIDs } from ${collectorPath};
import { readProcessTable } from ${tablePath};

test('it opens a view', async () => {
  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  await view.navigate('about:blank');

  await Bun.write(${JSON.stringify(`${file}.pids.json`)}, JSON.stringify(collectDescendantPIDs(readProcessTable() ?? [], process.pid)));
});
`,
      ),
    ),
  );

  await writeFile(
    recorder,
    `import { afterAll } from 'bun:test';
import { collectDescendantPIDs } from ${collectorPath};
import { readProcessTable } from ${tablePath};

afterAll(async () => {
  const table = readProcessTable() ?? [];
  const descendants = collectDescendantPIDs(table, process.pid);

  await Bun.write(${JSON.stringify(afterStopPath)}, JSON.stringify(table.filter((entry) => descendants.includes(entry.pid))));
});
`,
  );

  // The recorder loads after the browser preload, so its afterAll runs after the preload's.
  const tests = Bun.spawn(
    [
      process.execPath,
      'test',
      '--parallel=1',
      '--randomize',
      '--no-isolate',
      '--preload',
      join(import.meta.dir, 'browser-preload.ts'),
      '--preload',
      recorder,
      ...files,
    ],
    { cwd: process.cwd(), env: process.env, stdout: 'pipe', stderr: 'pipe', detached: true },
  );

  ctx.stack.defer(async () => {
    await stopProcessGroups(tests.pid, testProcesses);
    await tests.exited;
  });

  const exitCode = await tests.exited;

  const recorded = await Promise.all(
    files.map((file): Promise<unknown> => Bun.file(`${file}.pids.json`).json()),
  );

  const afterStopJSON: unknown = await Bun.file(afterStopPath).json();

  const afterStop = z.array(z.object({ pid: z.number(), state: z.string() })).parse(afterStopJSON);

  expect(exitCode).toBe(0);

  const chromePIDs = recorded.flat();

  expect(chromePIDs).not.toBeEmpty();

  expect(
    afterStop.filter((entry) => chromePIDs.includes(entry.pid) && !isZombieState(entry.state)),
  ).toStrictEqual([]);
});
