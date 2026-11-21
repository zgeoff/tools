import { expect, onTestFinished, test } from 'bun:test';
import { lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { removeEnvOverrides } from '../core/remove-env-overrides.ts';
import { updateEnv } from '../core/update-env.ts';
import { createTempDir } from '../fs/create-temp-dir.ts';
import { run } from '../process/index.ts';
import { linkCommands } from './link-commands.ts';

function setupTest() {
  return { directory: createTempDir('link-commands').path };
}

test('it symlinks the real command of each name into the folder', () => {
  const ctx = setupTest();

  linkCommands(ctx.directory, ['git', 'ls']);

  expect({
    git: lstatSync(join(ctx.directory, 'git')).isSymbolicLink(),
    ls: lstatSync(join(ctx.directory, 'ls')).isSymbolicLink(),
    target: Bun.which('git') === readlinkSync(join(ctx.directory, 'git')),
  }).toStrictEqual({ git: true, ls: true, target: true });
});

test('it lets a test that sets PATH to the folder alone run the linked command', async () => {
  const ctx = setupTest();

  onTestFinished(removeEnvOverrides);
  linkCommands(ctx.directory, ['git']);
  updateEnv('PATH', ctx.directory);

  const result = await run(['git', '--version']);

  expect(result.stdout).toStartWith('git version');
});

test('it throws on a name that PATH lacks', () => {
  const ctx = setupTest();

  expect(() => {
    linkCommands(ctx.directory, ['git', 'no-such-command-anywhere']);
  }).toThrow('no-such-command-anywhere is not on PATH');
});

test('it replaces a link that is already there', () => {
  const ctx = setupTest();

  linkCommands(ctx.directory, ['git']);

  expect(() => {
    linkCommands(ctx.directory, ['git']);
  }).not.toThrow();
});
