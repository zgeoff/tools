import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readGitEnv } from '../test-utils/read-git-env.ts';
import { runHookedPush } from '../test-utils/run-hooked-push.ts';
import { writeStubPrograms } from '../test-utils/write-stub-programs.ts';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'run-hooked-push-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const env = readGitEnv(directory);
  const repo = join(directory, 'repo');
  const origin = join(directory, 'origin.git');

  await $`git init --quiet --bare --initial-branch=main ${origin}`.env({ ...env });
  await $`git init --quiet --initial-branch=main ${repo}`.env({ ...env });
  await $`git commit --quiet --allow-empty -m ${'chore: start the repo'}`.cwd(repo).env({ ...env });
  await $`git remote add origin ${origin}`.cwd(repo).env({ ...env });

  return { repo, env };
}

test('it pushes the ref and returns the hook output with no failed job', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, '.git/hooks'), { 'pre-push': 'echo "✔️ lint"' });

  const push = await runHookedPush(ctx.repo, 'main', ctx.env);

  expect({ exitCode: push.exitCode, failedJobs: push.failedJobs }).toStrictEqual({
    exitCode: 0,
    failedJobs: [],
  });

  expect(push.output).toInclude('✔️ lint');
});

test('it fails the push and names each job the hook marks as failed', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, '.git/hooks'), {
    'pre-push': 'echo "🥊 commits (0.40 seconds)"\nexit 1',
  });

  const push = await runHookedPush(ctx.repo, 'main', ctx.env);

  expect({ exitCode: push.exitCode, failedJobs: push.failedJobs }).toStrictEqual({
    exitCode: 1,
    failedJobs: ['commits'],
  });
});
