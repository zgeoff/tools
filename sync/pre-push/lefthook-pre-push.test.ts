import { expect, onTestFinished, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

// A main checkout with a pushable upstream and a linked worktree on its own branch. Every git call
// gets a clean environment, so a GIT_DIR this test inherits from a real hook cannot reach the repo
// it runs in.
async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'lefthook-pre-push-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  const env = {
    PATH: process.env['PATH'],
    HOME: dir,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };

  const main = join(dir, 'main');
  const worktree = join(dir, 'worktree');

  await $`git init --quiet --bare --initial-branch=main ${join(dir, 'upstream.git')}`
    .cwd(dir)
    .env(env);

  await $`git init --quiet --initial-branch=main ${main}`.cwd(dir).env(env);
  await $`git commit --quiet --allow-empty -m start`.cwd(main).env(env);
  await $`git remote add origin ${join(dir, 'upstream.git')}`.cwd(main).env(env);
  await $`git worktree add --quiet -b feature ${worktree}`.cwd(main).env(env);

  return { dir, env, main, worktree };
}

test('it leaves the main checkout non-bare when the test job runs in a pre-push from a worktree', async () => {
  const ctx = await setupTest();
  const source = await readFile(join(import.meta.dir, 'lefthook-pre-push.yml'), 'utf8');

  const baseline = Bun.YAML.parse(source) as {
    'pre-push': { jobs: { name: string; run: string }[] };
  };

  const testJob = baseline['pre-push'].jobs.find((job) => job.name === 'test');

  // The related tests stand in as one that runs a plain git init in a fresh folder, with the
  // environment the hook gives it, as a test that spawns git without a clean environment does.
  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({ scripts: { 'test:related': 'git init --quiet' } }),
  );

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\n${testJob?.run.replace('{files}', join(ctx.dir, 'fixture'))}\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  await $`git push --quiet origin feature`.cwd(ctx.worktree).env(ctx.env);

  const bare = await $`git config --get core.bare`.cwd(ctx.main).env(ctx.env).text();

  expect(bare).toBe('false\n');
  expect(existsSync(join(ctx.dir, 'fixture/.git'))).toBeTrue();
});
