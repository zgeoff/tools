import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createPushedGitCommit } from './create-pushed-git-commit.ts';
import { readGitEnv } from './read-git-env.ts';
import { runGit } from './run-git.ts';

async function setupTest() {
  const directory = await mkdtemp(join(import.meta.dir, '.test-create-pushed-git-commit-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const origin = join(directory, 'origin.git');
  const checkout = join(directory, 'checkout');

  await runGit(directory, env, ['init', '--quiet', '--bare', '-b', 'main', origin]);
  await runGit(directory, env, ['clone', '--quiet', origin, checkout]);

  return { env, origin, checkout };
}

test('it pushes the new commit to main of the origin and returns it', async () => {
  const ctx = await setupTest();
  const commit = await createPushedGitCommit(ctx.checkout, ctx.env, { 'notes.md': '# Notes\n' });

  const result = Bun.spawnSync(['git', 'rev-parse', 'main'], { cwd: ctx.origin, env: ctx.env });

  expect(result.stdout.toString()).toBe(`${commit}\n`);
});
