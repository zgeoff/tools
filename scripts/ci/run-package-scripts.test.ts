import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { makeBunScriptRunner, runPackageScripts } from './run-package-scripts.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-run-package-scripts-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory };
}

test('it runs each listed script in order, each in its own log group', async () => {
  const ran: string[] = [];
  const output: string[] = [];

  const exitCode = await runPackageScripts({
    scripts: ' lint check test ',
    runScript: (name) => {
      ran.push(name);

      return Promise.resolve(0);
    },
    writeOutput: (text) => {
      output.push(text);
    },
  });

  expect(exitCode).toBe(0);
  expect(ran).toStrictEqual(['lint', 'check', 'test']);

  expect(output.join('')).toBe(
    [
      '::group::bun run lint',
      '::endgroup::',
      '::group::bun run check',
      '::endgroup::',
      '::group::bun run test',
      '::endgroup::',
      '',
    ].join('\n'),
  );
});

test('it stops at the first script that fails and returns its exit code', async () => {
  const ran: string[] = [];
  const exitCodes: Readonly<Record<string, number>> = { lint: 3, test: 0 };

  const exitCode = await runPackageScripts({
    scripts: ' lint test ',
    runScript: (name) => {
      ran.push(name);

      return Promise.resolve(exitCodes[name] ?? 0);
    },
    writeOutput: () => {},
  });

  expect(exitCode).toBe(3);
  expect(ran).toStrictEqual(['lint']);
});

test('it runs nothing for an empty list', async () => {
  const ran: string[] = [];

  const exitCode = await runPackageScripts({
    scripts: '  ',
    runScript: (name) => {
      ran.push(name);

      return Promise.resolve(0);
    },
    writeOutput: () => {},
  });

  expect(exitCode).toBe(0);
  expect(ran).toStrictEqual([]);
});

test('it runs a package script through bun run and returns its exit code', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'package.json'),
    JSON.stringify({ scripts: { lint: 'echo lint >> ran && exit 3' } }),
  );

  const runScript = makeBunScriptRunner(ctx.directory, process.env);

  const exitCode = await runScript('lint');
  const ran = await readFile(join(ctx.directory, 'ran'), 'utf8');

  expect(exitCode).toBe(3);
  expect(ran).toBe('lint\n');
});
