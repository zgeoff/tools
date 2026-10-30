import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { hostname, tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { buildBrowserRun } from '../packages/rig/src/browser/build-browser-run.ts';
import { pickChromeDirs } from '../packages/rig/src/browser/pick-chrome-dirs.ts';
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
        stdout: 'inherit',
        stderr: 'inherit',
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
  const phasesPath = join(ctx.repoRoot, 'phases.txt');

  await writeFile(phasesPath, `spawn ${Date.now()}\n`);

  const buildScript = [
    `echo "build-start $(date +%s%3N)" >> '${phasesPath}'`,
    'mkdir -p "$RIG_BROWSER_BUILD_DIR"',
    `echo built >> '${invocationsPath}'`,
    `echo '<main>notes</main>' > "$RIG_BROWSER_BUILD_DIR/index.html"`,
    `echo "build-end $(date +%s%3N)" >> '${phasesPath}'`,
  ].join(' && ');

  await writeFile(join(ctx.repoRoot, 'bunfig.toml'), '[test]\npreload = ["./first.ts"]\n');

  await writeFile(
    join(ctx.repoRoot, 'first.ts'),
    `import { appendFileSync } from 'node:fs';\nappendFileSync('${phasesPath}', \`test-process \${Date.now()}\\n\`);\n`,
  );

  await writeFile(
    join(ctx.repoRoot, 'package.json'),
    JSON.stringify({ scripts: { 'build:browser': buildScript } }),
  );

  await writeFile(
    join(ctx.repoRoot, 'notes.browser.test.ts'),
    [
      "import { expect, test } from 'bun:test';",
      '',
      "import { appendFileSync } from 'node:fs';",
      "test('it reads the build', async () => {",
      `  appendFileSync('${phasesPath}', \`test-body \${Date.now()}\\n\`);`,
      "  const page = await Bun.file(process.env['RIG_BROWSER_BUILD_DIR'] + '/index.html').text();",
      '',
      String.raw`  expect(page).toBe('<main>notes</main>\n');`,
      '});',
      '',
    ].join('\n'),
  );

  const lane = ctx.startLane();

  const exitCode = await lane.exited;

  await writeFile(phasesPath, `rig-exit ${Date.now()}\n`, { flag: 'a' });

  const phasesText = await readFile(phasesPath, 'utf8');

  const phases = phasesText
    .trim()
    .split('\n')
    .map((line) => line.split(' '));

  const startMs = Number(phases[0]?.[1]);

  console.log(
    `PHASES ${phases.map((phase) => `${phase[0]}=+${Number(phase[1]) - startMs}`).join(' ')}`,
  );

  const invocations = await readFile(invocationsPath, 'utf8');

  expect(exitCode).toBe(0);
  expect(invocations).toBe('built\n');
});
