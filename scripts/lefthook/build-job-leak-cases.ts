import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JobSandbox } from './create-job-sandbox.ts';
import { parseBaselineJobs } from './parse-baseline-jobs.ts';
import { writeStubPrograms } from './write-stub-programs.ts';

export interface BaselineJobCase {
  readonly title: string;

  // Returns what went wrong, or null when the job behaves.
  readonly check: (sandbox: JobSandbox) => Promise<string | null>;
}

// A hook in a linked worktree exports these, and a job that keeps them points git at the wrong repo.
const worktreeGitEnv = {
  GIT_DIR: '/srv/kettle/.git/worktrees/lid',
  GIT_WORK_TREE: '/srv/lid',
  GIT_INDEX_FILE: '/srv/kettle/.git/worktrees/lid/index',
};

export function buildJobLeakCases(configText: string): BaselineJobCase[] {
  const jobs = parseBaselineJobs(configText);

  return [
    ...jobs.map((job): BaselineJobCase => ({
      title: `the ${job.hook} job ${job.name} runs without git's repository variables`,
      check: async (sandbox) => {
        await writeStubPrograms(join(sandbox.repo, 'node_modules/.bin'), {
          diet: 'env >> diet-env\necho --- >> diet-env',
        });

        await writeStubPrograms(sandbox.bin, {
          shellcheck: 'exit 0',
          shfmt: 'exit 0',
          actionlint: 'exit 0',
        });

        await sandbox.runJob(
          { hook: job.hook, name: job.name, files: ['kettle.ts'] },
          { ...sandbox.env, ...worktreeGitEnv },
        );

        // diet writes no file when the job never reaches it.
        const dietEnv = await readFile(join(sandbox.repo, 'diet-env'), 'utf8').catch(
          (error: unknown) => {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
              return '';
            }

            throw error;
          },
        );

        return findGitVariableFault(dietEnv, 'it never ran diet');
      },
    })),
    ...jobs
      .filter((job) => job.listsBranchFiles)
      .map((job): BaselineJobCase => ({
        title: `the ${job.hook} job ${job.name} lists its files without git's repository variables`,
        check: async (sandbox) => {
          const chexSource = join(sandbox.repo, 'node_modules/@zgeoff/chex/src');

          await mkdir(chexSource, { recursive: true });

          await writeFile(
            join(chexSource, 'read-branch-files.ts'),
            "await Bun.write('files-env', Object.keys(process.env).filter((key) => key.startsWith('GIT_')).join(','));\n",
          );

          const run = await sandbox.runJob(
            { hook: job.hook, name: job.name, files: [], part: 'files' },
            { ...sandbox.env, ...worktreeGitEnv },
          );

          if (run.exitCode !== 0) {
            return `its files command exited ${run.exitCode}: ${run.output.trim()}`;
          }

          const filesEnv = await readFile(join(sandbox.repo, 'files-env'), 'utf8');

          return filesEnv === ''
            ? null
            : `its files command kept ${filesEnv.split(',').toSorted().join(', ')}`;
        },
      })),
  ];
}

function findGitVariableFault(envText: string, missing: string): string | null {
  if (!envText.includes('---')) {
    return missing;
  }

  const kept = envText
    .split('\n')
    .filter((line) => line.startsWith('GIT_'))
    .map((line) => line.slice(0, line.indexOf('=')));

  return kept.length === 0 ? null : `it kept ${[...new Set(kept)].toSorted().join(', ')}`;
}
