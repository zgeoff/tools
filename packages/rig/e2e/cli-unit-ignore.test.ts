import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv, readRunFolderPrefix, runGit, writeTreeFiles } from '@zgeoff/testing/helpers';
import { run } from '@zgeoff/testing/process';
import { resolveProgram } from '../src/programs/index.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rig-unit-ignore-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repoRoot = join(directory, 'bakery');

  const rig = await resolveProgram('rig');

  return {
    repoRoot,
    gitEnv: readGitEnv(directory),
    rigModulePath: join(import.meta.dir, '..', 'src', 'index.ts'),
    runRig: (args: readonly string[]) =>
      run(rig.command, { args: [...args], cwd: repoRoot, env: { TMPDIR: tmpdir() } }),
  };
}

test('it runs neither an ignored file nor a lane file under rig unit, and runs the rest', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"bakery","private":true}',
    'rig.config.ts': [
      `import { defineRig } from '${ctx.rigModulePath}';`,
      '',
      "export default defineRig({ ignore: ['skip/**'], lanes: { kiln: { limit: '15s' } } });",
      '',
    ].join('\n'),
    'skip/oven.test.ts': [
      "import { test } from 'bun:test';",
      '',
      "test('the ignored suite runs', () => { throw new Error('skip/oven.test.ts ran'); });",
      '',
    ].join('\n'),
    'src/oven.kiln.test.ts': [
      "import { test } from 'bun:test';",
      '',
      "test('the kiln suite runs', () => { throw new Error('src/oven.kiln.test.ts ran'); });",
      '',
    ].join('\n'),
    'src/loaf.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the unit suite runs', () => { expect(2 + 2).toBe(4); });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);

  const result = await ctx.runRig(['unit']);

  const output = `${result.stdout}${result.stderr}`;

  expect({
    exitCode: result.exitCode,
    ranOneFile: output.includes('Ran 1 test across 1 file.'),
    ranIgnoredFile: output.includes('skip/oven.test.ts'),
    ranLaneFile: output.includes('src/oven.kiln.test.ts'),
  }).toStrictEqual({ exitCode: 0, ranOneFile: true, ranIgnoredFile: false, ranLaneFile: false });
});
