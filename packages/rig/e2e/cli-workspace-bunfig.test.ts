import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readGitEnv, readRunFolderPrefix, runGit, writeTreeFiles } from '@zgeoff/testing/helpers';
import { run } from '@zgeoff/testing/process';
import { resolveProgram } from '../src/e2e.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), readRunFolderPrefix('rig-workspace-bunfig-')));

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

test('it runs the related tests of 2 packages, each under the preload of its own bunfig.toml', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"bakery","private":true,"workspaces":["packages/*"]}',
    'rig.config.ts': [
      `import { defineRig } from '${ctx.rigModulePath}';`,
      '',
      'export default defineRig({});',
      '',
    ].join('\n'),
    'bunfig.toml': '[test]\npreload = ["./setup-root.ts"]\n',
    'setup-root.ts': "Reflect.set(globalThis, 'bakeryPreload', 'root');\n",
    'packages/oven/package.json': '{"name":"oven","private":true}',
    'packages/oven/bunfig.toml': '[test]\npreload = ["./setup-oven.ts"]\n',
    'packages/oven/setup-oven.ts': "Reflect.set(globalThis, 'bakeryPreload', 'oven');\n",
    'packages/oven/src/heat.ts': 'export const heat = 220;\n',
    'packages/oven/src/heat.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the oven preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('oven'); });",
      '',
    ].join('\n'),
    'packages/kettle/package.json': '{"name":"kettle","private":true}',
    'packages/kettle/bunfig.toml': '[test]\npreload = ["./setup-kettle.ts"]\n',
    'packages/kettle/setup-kettle.ts': "Reflect.set(globalThis, 'bakeryPreload', 'kettle');\n",
    'packages/kettle/src/boil.ts': 'export const boil = 100;\n',
    'packages/kettle/src/boil.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the kettle preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('kettle'); });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);

  const result = await ctx.runRig([
    'related',
    'packages/oven/src/heat.ts',
    'packages/kettle/src/boil.ts',
  ]);

  const output = `${result.stdout}${result.stderr}`;

  expect({
    exitCode: result.exitCode,
    passCount: output.match(/^\s*1 pass$/gmu)?.length,
    hasFailure: /^\s*[1-9]\d* fail$/mu.test(output),
  }).toStrictEqual({ exitCode: 0, passCount: 2, hasFailure: false });
});

test('it runs a related test that a bunfigs entry matches under the bunfig the entry names', async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"bakery","private":true,"workspaces":["packages/*"]}',
    'rig.config.ts': [
      `import { defineRig } from '${ctx.rigModulePath}';`,
      '',
      "export default defineRig({ bunfigs: [{ path: 'bunfig.window.toml', files: ['packages/shop/**/*.test.tsx'] }] });",
      '',
    ].join('\n'),
    'bunfig.toml': '[test]\npreload = ["./setup-root.ts"]\n',
    'setup-root.ts': "Reflect.set(globalThis, 'bakeryPreload', 'root');\n",
    'bunfig.window.toml': '[test]\npreload = ["./setup-window.ts"]\n',
    'setup-window.ts': "Reflect.set(globalThis, 'bakeryPreload', 'window');\n",
    'packages/shop/package.json': '{"name":"shop","private":true}',
    'packages/shop/src/counter.tsx': 'export const counter = 3;\n',
    'packages/shop/src/counter.test.tsx': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the window preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('window'); });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);

  const result = await ctx.runRig(['related', 'packages/shop/src/counter.tsx']);

  const output = `${result.stdout}${result.stderr}`;

  expect({
    exitCode: result.exitCode,
    passCount: output.match(/^\s*1 pass$/gmu)?.length,
    hasFailure: /^\s*[1-9]\d* fail$/mu.test(output),
  }).toStrictEqual({ exitCode: 0, passCount: 1, hasFailure: false });
});

test("it runs a package's tests under its own bunfig.toml, an entry's tests under its bunfig, and the rest under the root's, under rig unit", async () => {
  const ctx = await setupTest();

  await writeTreeFiles(ctx.repoRoot, {
    'package.json': '{"name":"bakery","private":true,"workspaces":["packages/*"]}',
    'rig.config.ts': [
      `import { defineRig } from '${ctx.rigModulePath}';`,
      '',
      "export default defineRig({ bunfigs: [{ path: 'bunfig.window.toml', files: ['packages/shop/**/*.test.tsx'] }] });",
      '',
    ].join('\n'),
    'bunfig.toml': '[test]\npreload = ["./setup-root.ts"]\n',
    'setup-root.ts': "Reflect.set(globalThis, 'bakeryPreload', 'root');\n",
    'bunfig.window.toml': '[test]\npreload = ["./setup-window.ts"]\n',
    'setup-window.ts': "Reflect.set(globalThis, 'bakeryPreload', 'window');\n",
    'packages/oven/package.json': '{"name":"oven","private":true}',
    'packages/oven/bunfig.toml': '[test]\npreload = ["./setup-oven.ts"]\n',
    'packages/oven/setup-oven.ts': "Reflect.set(globalThis, 'bakeryPreload', 'oven');\n",
    'packages/oven/src/heat.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the oven preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('oven'); });",
      '',
    ].join('\n'),
    'packages/shop/package.json': '{"name":"shop","private":true}',
    'packages/shop/src/counter.test.tsx': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the window preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('window'); });",
      '',
    ].join('\n'),
    'packages/shop/src/till.test.ts': [
      "import { expect, test } from 'bun:test';",
      '',
      "test('the root preload ran', () => { expect(Reflect.get(globalThis, 'bakeryPreload')).toBe('root'); });",
      '',
    ].join('\n'),
  });

  await runGit(ctx.repoRoot, ctx.gitEnv, ['init', '--quiet']);
  await runGit(ctx.repoRoot, ctx.gitEnv, ['add', '-A']);

  const result = await ctx.runRig(['unit']);

  const output = `${result.stdout}${result.stderr}`;

  expect({
    exitCode: result.exitCode,
    passCount: output.match(/^\s*1 pass$/gmu)?.length,
    hasFailure: /^\s*[1-9]\d* fail$/mu.test(output),
  }).toStrictEqual({ exitCode: 0, passCount: 3, hasFailure: false });
});
