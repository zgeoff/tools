import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runOxlint } from './run-oxlint.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-oxlint-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it gives exit code 1 and the report for a file with a problem', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'kettle.js'), 'debugger;\n');

  const run = await runOxlint(['-A', 'all', '-D', 'no-debugger', 'kettle.js'], ctx.directory);

  expect(run.exitCode).toBe(1);
  expect(run.stdout).toInclude('no-debugger');
});

test('it gives exit code 0 for a clean file', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'kettle.js'), 'export const cups = 2;\n');

  const run = await runOxlint(['-A', 'all', '-D', 'no-debugger', 'kettle.js'], ctx.directory);

  expect(run.exitCode).toBe(0);
});

test('it runs oxlint with one lint thread', async () => {
  const ctx = await setupTest();

  // oxlint's thread count grows with each lint thread, so the helper's run must
  // match a run that asks for one thread itself
  const plugin =
    "import { appendFileSync, readFileSync } from 'node:fs';\n" +
    "const status = () => readFileSync('/proc/self/status', 'utf8');\n" +
    'export default {\n' +
    "  meta: { name: 'probe' },\n" +
    '  rules: {\n' +
    '    threads: {\n' +
    '      create() {\n' +
    "        appendFileSync(new URL('./threads.txt', import.meta.url), /^Threads:\\s+(\\d+)$/m.exec(status())[1]);\n" +
    '        return {};\n' +
    '      },\n' +
    '    },\n' +
    '  },\n' +
    '};\n';

  const config = JSON.stringify({
    jsPlugins: ['./probe.mjs'],
    rules: { 'probe/threads': 'error' },
  });

  await mkdir(join(ctx.directory, 'helper'));
  await mkdir(join(ctx.directory, 'reference'));
  await writeFile(join(ctx.directory, 'helper', 'probe.mjs'), plugin);
  await writeFile(join(ctx.directory, 'reference', 'probe.mjs'), plugin);
  await writeFile(join(ctx.directory, 'helper', '.oxlintrc.json'), config);
  await writeFile(join(ctx.directory, 'reference', '.oxlintrc.json'), config);
  await writeFile(join(ctx.directory, 'helper', 'kettle.js'), 'export const cups = 2;\n');
  await writeFile(join(ctx.directory, 'reference', 'kettle.js'), 'export const cups = 2;\n');
  await runOxlint(['-c', '.oxlintrc.json', 'kettle.js'], join(ctx.directory, 'helper'));

  const reference = Bun.spawn(
    [
      join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'oxlint'),
      '--threads=1',
      '-c',
      '.oxlintrc.json',
      'kettle.js',
    ],
    { cwd: join(ctx.directory, 'reference'), stdout: 'ignore', stderr: 'ignore' },
  );

  await reference.exited;

  const helperThreads = await readFile(join(ctx.directory, 'helper', 'threads.txt'), 'utf8');
  const referenceThreads = await readFile(join(ctx.directory, 'reference', 'threads.txt'), 'utf8');

  expect(helperThreads).toBe(referenceThreads);
});
