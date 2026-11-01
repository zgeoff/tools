import { expect, test } from 'bun:test';
import { buildInitGuardHooks } from '../../test-utils/build-init-guard-hooks.ts';
import { runLefthookGuardCheck } from './run-lefthook-guard-check.ts';

function setupTest() {
  const output: string[] = [];
  const errors: string[] = [];

  const run = (readLefthook: () => Promise<string>) =>
    runLefthookGuardCheck({
      readLefthook,
      writeOutput: (text) => {
        output.push(text);
      },
      writeError: (text) => {
        errors.push(text);
      },
    });

  return { output, errors, run };
}

test('it passes a lefthook.yml that runs the guard chex init writes in both hooks', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(() =>
    Promise.resolve(
      `extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n${buildInitGuardHooks()}`,
    ),
  );

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 0,
    output: [],
    errors: [],
  });
});

test('it fails a lefthook.yml that lacks the guard, and names the command that adds it', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(() =>
    Promise.resolve(
      'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\npre-push:\n  jobs:\n    - name: test\n      run: bun test\n',
    ),
  );

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 1,
    output: [
      'lefthook.yml lacks the chex-baseline job that chex init writes first in pre-commit and pre-push; run bun packages/chex/src/cli.ts init\n',
    ],
    errors: [],
  });
});

test('it fails a lefthook.yml whose guard differs from the one chex init writes', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(() =>
    Promise.resolve('pre-commit:\n  jobs:\n    - name: chex-baseline\n      run: exit 0\n'),
  );

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 1,
    output: [
      'lefthook.yml has a chex-baseline job under pre-commit that differs from the one chex init writes; remove it, then run chex init again\n',
    ],
    errors: [],
  });
});

test('it returns 2 when lefthook.yml cannot be read', async () => {
  const ctx = setupTest();

  const exitCode = await ctx.run(() =>
    Promise.reject(new Error("ENOENT: no such file or directory, open 'lefthook.yml'")),
  );

  expect({ exitCode, output: ctx.output, errors: ctx.errors }).toStrictEqual({
    exitCode: 2,
    output: [],
    errors: ["lefthook-guard: ENOENT: no such file or directory, open 'lefthook.yml'\n"],
  });
});
