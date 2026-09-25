import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const tsc = join(import.meta.dir, '../../node_modules/.bin/tsc');
const projects: string[] = [];

afterEach(async () => {
  await Promise.all(projects.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// The project sits inside this repo so `extends` resolves @zgeoff/tsconfig through the
// workspace link in the root node_modules, the way a consumer's install resolves it.
async function writeProject(variant: string, source: string): Promise<string> {
  const dir = await mkdtemp(join(import.meta.dir, '.test-'));

  projects.push(dir);

  const config = { extends: `@zgeoff/tsconfig/${variant}`, include: ['index.ts'] };

  await writeFile(join(dir, 'tsconfig.json'), JSON.stringify(config));
  await writeFile(join(dir, 'index.ts'), source);

  return dir;
}

function runTSC(dir: string, args: readonly string[]): { code: number; output: string } {
  const result = Bun.spawnSync([tsc, '-p', dir, ...args]);

  return {
    code: result.exitCode,
    output: `${result.stdout.toString()}${result.stderr.toString()}`,
  };
}

function isShowConfig(value: unknown): value is { compilerOptions: object } {
  return typeof value === 'object' && value !== null && 'compilerOptions' in value;
}

function readCompilerOptions(dir: string): object {
  const parsed: unknown = JSON.parse(runTSC(dir, ['--showConfig']).output);

  if (!isShowConfig(parsed)) {
    throw new Error(`tsc --showConfig printed no compilerOptions for ${dir}`);
  }

  return parsed.compilerOptions;
}

test('it layers the bundler-mode options over the strictest flags', async () => {
  const dir = await writeProject('base.json', 'export {};\n');

  expect(readCompilerOptions(dir)).toContainEntries([
    ['strict', true],
    ['noUncheckedIndexedAccess', true],
    ['exactOptionalPropertyTypes', true],
    ['module', 'preserve'],
    ['moduleResolution', 'bundler'],
    ['verbatimModuleSyntax', true],
    ['noEmit', true],
  ]);
});

test('it rejects an unchecked index access under the base config', async () => {
  const dir = await writeProject(
    'base.json',
    'const names: string[] = [];\nexport const length: number = names[0].length;\n',
  );

  const result = runTSC(dir, []);

  expect(result.code).not.toBe(0);
  expect(result.output).toInclude('TS2532');
});

test('it leaves the DOM out of the base config', async () => {
  const dir = await writeProject('base.json', 'export const body = document.body;\n');

  const result = runTSC(dir, []);

  expect(result.code).not.toBe(0);
  expect(result.output).toInclude("Cannot find name 'document'");
});

test('it adds the DOM and the automatic JSX runtime in the react config', async () => {
  const dir = await writeProject('react.json', 'export const body: HTMLElement = document.body;\n');

  expect(runTSC(dir, [])).toEqual({ code: 0, output: '' });

  expect(readCompilerOptions(dir)).toContainEntries([
    ['jsx', 'react-jsx'],
    ['lib', ['es2024', 'dom', 'dom.iterable']],
    ['strict', true],
  ]);
});
