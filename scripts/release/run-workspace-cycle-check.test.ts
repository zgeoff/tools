import { expect, test } from 'bun:test';
import { runWorkspaceCycleCheck } from './run-workspace-cycle-check.ts';

function setupTest(files: Readonly<Record<string, unknown>>) {
  const output: string[] = [];
  const errors: string[] = [];

  return {
    output,
    errors,
    options: {
      readJSON: (path: string) => {
        if (!(path in files)) {
          return Promise.reject(new Error(`no file at ${path}`));
        }

        return Promise.resolve(files[path]);
      },
      readMatchingFolders: (pattern: string) => {
        const folders = pattern === 'packages/*' ? ['packages/ledger', 'packages/sampler'] : [];

        return Promise.resolve(folders);
      },
      writeOutput: (text: string) => {
        output.push(text);
      },
      writeError: (text: string) => {
        errors.push(text);
      },
    },
  };
}

test('it exits 1 and names the cycle with its fix', async () => {
  const ctx = setupTest({
    'package.json': { workspaces: { packages: ['packages/*'] } },
    'packages/ledger/package.json': {
      name: '@acme/ledger',
      devDependencies: { '@acme/sampler': 'workspace:*' },
    },
    'packages/sampler/package.json': {
      name: '@acme/sampler',
      devDependencies: { '@acme/ledger': 'workspace:*' },
    },
  });

  const exitCode = await runWorkspaceCycleCheck(ctx.options);

  expect(exitCode).toBe(1);

  expect(ctx.output).toStrictEqual([
    "workspace-cycle: @acme/ledger -> @acme/sampler -> @acme/ledger; release-please can't order these releases, so remove one of these dependencies\n",
  ]);
});

test('it exits 0 and prints nothing when the packages form no cycle', async () => {
  const ctx = setupTest({
    'package.json': { workspaces: ['packages/*'] },
    'packages/ledger/package.json': {
      name: '@acme/ledger',
      dependencies: { '@acme/sampler': 'workspace:*' },
    },
    'packages/sampler/package.json': { name: '@acme/sampler' },
  });

  const exitCode = await runWorkspaceCycleCheck(ctx.options);

  expect({ exitCode, output: ctx.output }).toStrictEqual({ exitCode: 0, output: [] });
});

test('it exits 2 and prints the error when a manifest cannot be read', async () => {
  const ctx = setupTest({ 'package.json': { workspaces: ['packages/*'] } });

  const exitCode = await runWorkspaceCycleCheck(ctx.options);

  expect(exitCode).toBe(2);
  expect(ctx.errors).toStrictEqual(['workspace-cycle: no file at packages/ledger/package.json\n']);
});
