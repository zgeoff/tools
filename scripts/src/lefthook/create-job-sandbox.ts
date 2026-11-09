import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import type { BaselineJob, BaselineJobRun } from './run-baseline-job.ts';
import { runBaselineJob } from './run-baseline-job.ts';
import { writeStubPrograms } from './write-stub-programs.ts';

export type JobEnv = Readonly<Record<string, string | undefined>>;

export interface JobSandbox extends AsyncDisposable {
  readonly repo: string;

  // The only folder on the PATH of a job the sandbox runs.
  readonly bin: string;

  readonly env: JobEnv;

  readonly runJob: (job: BaselineJob, env: JobEnv) => Promise<BaselineJobRun>;
}

// The PATH holds only bun, env, date, git and the stubs a case writes, so a program the host has,
// such as shfmt or actionlint, is missing unless the case stubs it.
export async function createJobSandbox(configText: string): Promise<JobSandbox> {
  const repo = await mkdtemp(join(tmpdir(), 'baseline-jobs-check-'));

  try {
    const bin = join(repo, '.bin');

    await writeStubPrograms(join(repo, 'node_modules/.bin'), {
      diet: '[ "$1" = -- ] && shift\nexec "$@"',
    });

    await writeStubPrograms(bin, {});
    await symlink(process.execPath, join(bin, 'bun'));

    for (const program of ['env', 'date', 'git']) {
      const programPath = Bun.which(program);

      if (programPath === null) {
        throw new Error(`${program} is not on the PATH; install it, then run the check again`);
      }

      await symlink(programPath, join(bin, program));
    }

    return {
      repo,
      bin,
      env: { PATH: bin, HOME: repo },
      runJob: (job, env) =>
        runBaselineJob(
          {
            readConfigText: () => Promise.resolve(configText),
            runScript: async (script, cwd, scriptEnv) => {
              const result = await $`/bin/sh -c ${script}`
                .cwd(cwd)
                .env({ ...scriptEnv })
                .nothrow()
                .quiet();

              return {
                exitCode: result.exitCode,
                output: `${result.stdout.toString()}${result.stderr.toString()}`,
              };
            },
          },
          repo,
          job,
          env,
        ),
      [Symbol.asyncDispose]: () => rm(repo, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(repo, { recursive: true, force: true });

    throw error;
  }
}
