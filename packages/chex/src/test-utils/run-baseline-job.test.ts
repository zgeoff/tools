import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBaselineJob } from './run-baseline-job.ts';
import { writeStubPrograms } from './write-stub-programs.ts';

async function setupTest() {
  const repo = await mkdtemp(join(tmpdir(), 'run-baseline-job-'));

  onTestFinished(() => rm(repo, { recursive: true, force: true }));

  // `bun run` puts the tools repo's node_modules/.bin on the PATH, where bun x would find its own
  // diet in place of the stub.
  const searchPath = (process.env['PATH'] ?? '')
    .split(':')
    .filter((entry) => !entry.endsWith('node_modules/.bin'))
    .join(':');

  return { repo, env: { PATH: searchPath, HOME: repo } };
}

test('it runs the job script in the repo with the files quoted in place of {files}', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, 'node_modules/.bin'), {
    diet: '[ "$1" = -- ] && shift\nexec "$@"',
    oxlint: 'printf "%s\\n" "$@" > oxlint-args\necho "linted"',
  });

  const run = await runBaselineJob(
    ctx.repo,
    { hook: 'pre-push', name: 'lint', files: ["src/kettle's lid.ts"] },
    ctx.env,
  );

  const args = await readFile(join(ctx.repo, 'oxlint-args'), 'utf8');

  expect(run).toStrictEqual({ exitCode: 0, output: 'linted\n' });
  expect(args).toBe("--no-error-on-unmatched-pattern\nsrc/kettle's lid.ts\n");
});

test('it returns the exit code and output of a job that fails', async () => {
  const ctx = await setupTest();

  await writeStubPrograms(join(ctx.repo, 'node_modules/.bin'), {
    diet: '[ "$1" = -- ] && shift\nexec "$@"',
    oxlint: 'echo "kettle.ts: unused import" >&2\nexit 1',
  });

  const run = await runBaselineJob(
    ctx.repo,
    { hook: 'pre-push', name: 'lint', files: ['kettle.ts'] },
    ctx.env,
  );

  expect(run).toStrictEqual({ exitCode: 1, output: 'kettle.ts: unused import\n' });
});

test('it throws for a job that lefthook.yml does not hold', async () => {
  const ctx = await setupTest();

  const run = runBaselineJob(
    ctx.repo,
    { hook: 'pre-commit', name: 'spelling', files: [] },
    ctx.env,
  );

  expect(run).rejects.toThrow('lefthook.yml has no pre-commit job named spelling');
});
