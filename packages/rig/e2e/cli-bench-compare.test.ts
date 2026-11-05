import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv, readRunFolderPrefix, runGit, writeTreeFiles } from '@zgeoff/testing/helpers';
import { run } from '@zgeoff/testing/process';
import { resolveProgram } from '../src/e2e.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rig-bench-compare-')));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repoRoot = join(directory, 'kettle');

  const rig = await resolveProgram('rig');

  return {
    repoRoot,
    gitEnv: readGitEnv(directory),
    benchModulePath: join(import.meta.dir, '..', 'src', 'bench.ts'),
    runRig: (args: readonly string[]) =>
      run(rig.command, { args: [...args], cwd: repoRoot, env: { TMPDIR: tmpdir() } }),
  };
}

test('it prints the base, the head and the change of each level when it compares against a base', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"kettle","private":true}',
    'bench/pour.bench.ts': [
      `import { defineBench } from '${ctx.benchModulePath}';`,
      '',
      "export default defineBench({ name: 'pour', budget: '1s', concurrency: [1, 4], run: () => Bun.sleep(1) });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['commit', '--quiet', '-m', 'pour in 1ms']);

  await writeTreeFiles(ctx.repoRoot, {
    'bench/pour.bench.ts': [
      `import { defineBench } from '${ctx.benchModulePath}';`,
      '',
      "export default defineBench({ name: 'pour', budget: '1s', concurrency: [1, 4], run: () => Bun.sleep(3) });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['commit', '--quiet', '-am', 'pour in 3ms']);

  const result = await ctx.runRig(['bench', '--base', 'HEAD~1']);

  expect({
    exitCode: result.exitCode,
    hasRowAtLevel1: /^pour\s+1\s+(?:\d+\.\d\dms\s+){4}\+\d+\.\d%$/mu.test(result.stdout),
    hasRowAtLevel4: /^pour\s+4\s+(?:\d+\.\d\dms\s+){4}\+\d+\.\d%$/mu.test(result.stdout),
  }).toStrictEqual({ exitCode: 0, hasRowAtLevel1: true, hasRowAtLevel4: true });
});

test('it exits 1 and says so when a benchmark is over its budget', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"kettle","private":true}',
    'bench/pour.bench.ts': [
      `import { defineBench } from '${ctx.benchModulePath}';`,
      '',
      "export default defineBench({ name: 'pour', budget: '1ms', run: () => Bun.sleep(5) });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);

  const result = await ctx.runRig(['bench']);

  expect({
    exitCode: result.exitCode,
    isOverBudget: result.stdout.includes('over budget'),
  }).toStrictEqual({
    exitCode: 1,
    isOverBudget: true,
  });
});
