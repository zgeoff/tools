import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { buildBrowserRun } from '../packages/rig/src/browser/build-browser-run.ts';
import { pickChromeDirs } from '../packages/rig/src/browser/pick-chrome-dirs.ts';
import { createTrackedRepo } from '../test-utils/create-tracked-repo.ts';
import { getRigE2EBin } from '../test-utils/get-rig-e2e-bin.ts';
import { stopProcessGroups } from '../test-utils/stop-process-groups.ts';
import { testProcesses } from '../test-utils/test-processes.ts';

async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const rigBin = getRigE2EBin(process.env);

  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-browser-build-'));

  stack.defer(() => rm(repoRoot, { recursive: true, force: true }));

  // Chrome's socket path must fit a Unix socket address, so the lane gets a TMPDIR of its own,
  // and the test asks the lane's own rule where the Chrome folder goes. A long TMPDIR sends that
  // folder to the /tmp that every user shares, which the removal of laneTmpdir does not reach.
  const laneTmpdir = await mkdtemp(join(tmpdir(), 'rb-'));

  stack.defer(() => rm(laneTmpdir, { recursive: true, force: true }));

  const chromeRunsDir = pickChromeDirs(
    laneTmpdir,
    userInfo().uid,
    buildBrowserRun(repoRoot, hostname(), '0'),
  ).runsDir;

  stack.defer(() => rm(chromeRunsDir, { recursive: true, force: true }));

  return {
    repoRoot,
    startLane: () => {
      const lane = Bun.spawn([rigBin, 'browser'], {
        cwd: repoRoot,
        env: { ...process.env, TMPDIR: laneTmpdir },
        stdout: 'ignore',
        stderr: 'ignore',
        detached: true,
      });

      // rig starts its build and its tests in process groups of their own, so the cleanup stops
      // those groups and rig's, and waits for them, before the folders go.
      stack.defer(async () => {
        if (lane.exitCode === null && lane.signalCode === null) {
          await stopProcessGroups(lane.pid, testProcesses);
        }

        await lane.exited;
      });

      return lane;
    },
  };
}

test("it runs the repo's build:browser script once, and gives the tests the folder the build wrote", async () => {
  const ctx = await setupTest();

  const invocationsPath = join(ctx.repoRoot, 'build-invocations.txt');

  const buildScript = [
    'mkdir -p "$RIG_BROWSER_BUILD_DIR"',
    `echo built >> '${invocationsPath}'`,
    `echo '<main>notes</main>' > "$RIG_BROWSER_BUILD_DIR/index.html"`,
  ].join(' && ');

  await createTrackedRepo(ctx.repoRoot, {
    'package.json': JSON.stringify({ scripts: { 'build:browser': buildScript } }),
    'notes.browser.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('it reads the build', async () => {",
      "  const page = await Bun.file(process.env['RIG_BROWSER_BUILD_DIR'] + '/index.html').text();",
      '',
      String.raw`  expect(page).toBe('<main>notes</main>\n');`,
      '});',
      '',
    ].join('\n'),
  });

  const lane = ctx.startLane();

  const exitCode = await lane.exited;
  const invocations = await readFile(invocationsPath, 'utf8');

  expect(exitCode).toBe(0);
  expect(invocations).toBe('built\n');
});
