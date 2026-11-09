import { expect, test } from 'bun:test';
import { runPackageScripts } from './run-package-scripts.ts';

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
