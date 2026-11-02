import { expect, test } from 'bun:test';
import type { BaselineJobRun } from './run-baseline-job.ts';
import { runBaselineJob } from './run-baseline-job.ts';

function setupTest() {
  const scripts: {
    script: string;
    repo: string;
    env: Readonly<Record<string, string | undefined>>;
  }[] = [];

  const deps = {
    readConfigText: () =>
      Promise.resolve(
        'pre-push:\n  jobs:\n    - name: lint\n      run: oxlint {files}\n    - name: test\n      run: rig related {files}\n',
      ),
    runScript: (
      script: string,
      repo: string,
      env: Readonly<Record<string, string | undefined>>,
    ): Promise<BaselineJobRun> => {
      scripts.push({ script, repo, env });

      return Promise.resolve({ exitCode: 1, output: 'kettle.ts: unused import\n' });
    },
  };

  return { deps, scripts };
}

test("it runs the named job's script in the repo, with the files quoted in place of {files}", async () => {
  const ctx = setupTest();

  await runBaselineJob(
    ctx.deps,
    '/srv/kettle',
    { hook: 'pre-push', name: 'lint', files: ["src/kettle's lid.ts", 'src/spout.ts'] },
    { HOME: '/srv/kettle' },
  );

  expect(ctx.scripts).toStrictEqual([
    {
      script: String.raw`oxlint 'src/kettle'\''s lid.ts' 'src/spout.ts'`,
      repo: '/srv/kettle',
      env: { HOME: '/srv/kettle' },
    },
  ]);
});

test('it returns the run of the script', async () => {
  const ctx = setupTest();

  const run = await runBaselineJob(
    ctx.deps,
    '/srv/kettle',
    { hook: 'pre-push', name: 'test', files: ['kettle.ts'] },
    {},
  );

  expect(run).toStrictEqual({ exitCode: 1, output: 'kettle.ts: unused import\n' });
});

test('it throws for a job that lefthook.yml does not hold', () => {
  const ctx = setupTest();

  const run = runBaselineJob(
    ctx.deps,
    '/srv/kettle',
    { hook: 'pre-commit', name: 'spelling', files: [] },
    {},
  );

  expect(run).rejects.toThrow('lefthook.yml has no pre-commit job named spelling');
});
