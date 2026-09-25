import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The project sits inside this repo so `extends` resolves @zgeoff/tsconfig through the
// workspace link in the root node_modules, the way a consumer's install resolves it.
async function setupTest(variant: string, source: string) {
  const dir = await mkdtemp(join(import.meta.dir, '.test-'));

  await writeFile(
    join(dir, 'tsconfig.json'),
    JSON.stringify({ extends: `@zgeoff/tsconfig/${variant}`, include: ['index.ts'] }),
  );

  await writeFile(join(dir, 'index.ts'), source);

  return {
    tsc: join(import.meta.dir, '../../node_modules/.bin/tsc'),
    dir,
    async [Symbol.asyncDispose]() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test('it layers the bundler-mode options over the strictest flags', async () => {
  await using project = await setupTest('base.json', 'export {};\n');

  const result = Bun.spawnSync([project.tsc, '-p', project.dir, '--showConfig']);
  const config: unknown = JSON.parse(result.stdout.toString());

  expect(config).toMatchObject({
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      module: 'preserve',
      moduleResolution: 'bundler',
      verbatimModuleSyntax: true,
      noEmit: true,
    },
  });
});

test('it rejects an unchecked index access under the base config', async () => {
  await using project = await setupTest(
    'base.json',
    'const names: string[] = [];\nexport const length: number = names[0].length;\n',
  );

  const result = Bun.spawnSync([project.tsc, '-p', project.dir]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude('TS2532');
});

test('it leaves the DOM out of the base config', async () => {
  await using project = await setupTest('base.json', 'export const body = document.body;\n');

  const result = Bun.spawnSync([project.tsc, '-p', project.dir]);

  expect(result.exitCode).toBe(1);
  expect(result.stdout.toString()).toInclude("Cannot find name 'document'");
});

test('it type-checks DOM code under the react config', async () => {
  await using project = await setupTest(
    'react.json',
    'export const body: HTMLElement = document.body;\n',
  );

  const result = Bun.spawnSync([project.tsc, '-p', project.dir]);

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toBe('');
});

test('it sets the automatic JSX runtime and the DOM libs in the react config', async () => {
  await using project = await setupTest('react.json', 'export {};\n');

  const result = Bun.spawnSync([project.tsc, '-p', project.dir, '--showConfig']);
  const config: unknown = JSON.parse(result.stdout.toString());

  expect(config).toMatchObject({
    compilerOptions: {
      jsx: 'react-jsx',
      lib: ['es2024', 'dom', 'dom.iterable'],
      strict: true,
    },
  });
});
