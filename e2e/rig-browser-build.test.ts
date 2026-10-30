import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const repoRoot = await mkdtemp(join(tmpdir(), 'rig-browser-cli-'));

  onTestFinished(() => rm(repoRoot, { recursive: true, force: true }));

  // Chrome's socket path must fit a Unix socket address, so the lane gets a short TMPDIR.
  const laneTmpdir = await mkdtemp(join(tmpdir(), 'rb-'));

  onTestFinished(() => rm(laneTmpdir, { recursive: true, force: true }));

  return { repoRoot, laneTmpdir };
}

test("it runs the repo's build:browser script once, and gives the tests the folder the build wrote", async () => {
  const ctx = await setupTest();

  const invocationsPath = join(ctx.repoRoot, 'build-invocations.txt');

  const buildScript = [
    'mkdir -p "$RIG_BROWSER_BUILD_DIR"',
    `echo built >> '${invocationsPath}'`,
    `echo '<main>notes</main>' > "$RIG_BROWSER_BUILD_DIR/index.html"`,
  ].join(' && ');

  await writeFile(
    join(ctx.repoRoot, 'package.json'),
    JSON.stringify({ scripts: { 'build:browser': buildScript } }),
  );

  await writeFile(
    join(ctx.repoRoot, 'notes.browser.test.ts'),
    [
      "import { expect, test } from 'bun:test';",
      '',
      "test('it reads the build', async () => {",
      "  const page = await Bun.file(process.env['RIG_BROWSER_BUILD_DIR'] + '/index.html').text();",
      '',
      String.raw`  expect(page).toBe('<main>notes</main>\n');`,
      '});',
      '',
    ].join('\n'),
  );

  const lane = Bun.spawn(
    [process.execPath, join(import.meta.dir, '..', 'packages', 'rig', 'src', 'cli.ts'), 'browser'],
    {
      cwd: ctx.repoRoot,
      env: { ...process.env, TMPDIR: ctx.laneTmpdir },
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );

  onTestFinished(async () => {
    if (lane.exitCode === null && lane.signalCode === null) {
      lane.kill('SIGKILL');
    }

    await lane.exited;
  });

  const exitCode = await lane.exited;
  const invocations = await readFile(invocationsPath, 'utf8');

  expect(exitCode).toBe(0);
  expect(invocations).toBe('built\n');
});
