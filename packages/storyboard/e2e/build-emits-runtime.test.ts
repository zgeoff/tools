import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { run } from '@zgeoff/testing/process';

function setupTest() {
  const packageDir = join(import.meta.dir, '..');

  return {
    // The package.json "default" condition points at dist, so a consumer outside Bun loads these.
    runBuild: () => run(['bun'], { args: ['run', 'build'], cwd: packageDir }),
    readEntry: (
      name: string,
    ): Promise<Partial<Record<'defineScene' | 'jsx' | 'jsxDEV', unknown>>> =>
      import(join(packageDir, 'dist', `${name}.js`)),
  };
}

test('#build emits runtime JS for the three default exports', async () => {
  const ctx = setupTest();

  const result = await ctx.runBuild();

  const [index, jsxRuntime, jsxDevRuntime] = await Promise.all([
    ctx.readEntry('index'),
    ctx.readEntry('jsx-runtime'),
    ctx.readEntry('jsx-dev-runtime'),
  ]);

  expect({
    exitCode: result.exitCode,
    index: typeof index.defineScene,
    jsx: typeof jsxRuntime.jsx,
    jsxDEV: typeof jsxDevRuntime.jsxDEV,
  }).toStrictEqual({
    exitCode: 0,
    index: 'function',
    jsx: 'function',
    jsxDEV: 'function',
  });
});
