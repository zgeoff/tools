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
  await $`git push --quiet -u origin main`.cwd(main).env(env);
  await $`git worktree add --quiet -b feature ${worktree}`.cwd(main).env(env);

  return {
    env,
    main,
    worktree,
    baseline: join(import.meta.dir, 'lefthook-pre-push.yml'),
    lefthook: join(import.meta.dir, '../../node_modules/.bin/lefthook'),
  };
}

test('it leaves the main checkout non-bare when the test job runs in a pre-push from a worktree', async () => {
  const ctx = await setupTest();

  // lefthook runs the real baseline over a branch that changes one file. The other jobs pass, and
  // the related tests stand in as a test that runs a plain git init in a fresh folder with the
  // environment the hook gives it; the trailing true swallows the file name.
  await writeFile(join(ctx.worktree, 'lefthook.yml'), `extends:\n  - ${ctx.baseline}\n`);
  await writeFile(join(ctx.worktree, 'fixture.ts'), 'export {};\n');

  await writeFile(
    join(ctx.worktree, 'package.json'),
    JSON.stringify({
      scripts: {
        'format:check': 'true',
        'lint:files': 'true',
        typecheck: 'true',
        'files:branch': 'echo fixture.ts',
        'test:related': 'git init --quiet sandbox && true',
      },
    }),
  );

  await $`git add -A`.cwd(ctx.worktree).env(ctx.env);
  await $`git commit --quiet -m fixture`.cwd(ctx.worktree).env(ctx.env);

  await writeFile(
    join(ctx.main, '.git/hooks/pre-push'),
    `#!/bin/sh\nexec ${process.execPath} ${ctx.lefthook} run pre-push "$@"\n`,
  );

  await chmod(join(ctx.main, '.git/hooks/pre-push'), 0o755);

  await $`git push --quiet origin feature`.cwd(ctx.worktree).env(ctx.env);

  const bare = await $`git config --get core.bare`.cwd(ctx.main).env(ctx.env).text();

  expect(bare).toBe('false\n');
  expect(existsSync(join(ctx.worktree, 'sandbox/.git'))).toBeTrue();
});

// Each suite that spawns git must stay safe without the baseline's env -u, so it runs here with
// the GIT_DIR a pre-push hook in the worktree exports.
test.each([
  ['packages/oxfmt-config/index.test.ts'],
  ['sync/skills/docs-writing/scripts/check-length.test.ts'],
  ['sync/skills/docs-writing/scripts/check-links.test.ts'],
  ['sync/skills/skill-writing/scripts/check-skill.test.ts'],
])(
  'it leaves the main checkout config and branch unchanged when %s inherits a worktree GIT_DIR',
  async (suite) => {
    const ctx = await setupTest();
    const config = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const head = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    await $`bun test ./${suite}`
      .cwd(join(import.meta.dir, '../..'))
      .env({ ...ctx.env, GIT_DIR: join(ctx.main, '.git/worktrees/worktree') })
      .quiet()
      .nothrow();

    const configAfter = await readFile(join(ctx.main, '.git/config'), 'utf8');
    const headAfter = await $`git rev-parse feature`.cwd(ctx.main).env(ctx.env).text();

    expect(configAfter).toBe(config);
    expect(headAfter).toBe(head);
  },
  30_000,
);
