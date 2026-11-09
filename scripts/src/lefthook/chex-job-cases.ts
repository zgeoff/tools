import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import type { BaselineJobCase } from './build-job-leak-cases.ts';
import type { BaselineJobRun } from './run-baseline-job.ts';
import { writeStubPrograms } from './write-stub-programs.ts';

const chexFolder = join(import.meta.dir, '../../../packages/chex');
const lefthookPath = join(import.meta.dir, '../../../node_modules/.bin/lefthook');

// What each job of chex's lefthook.yml does with the programs and scripts a repo has.
export const chexJobCases: readonly BaselineJobCase[] = [
  {
    title: 'the shell job passes with a notice when the machine lacks shfmt',
    check: async (sandbox) => {
      await writeStubPrograms(sandbox.bin, { shellcheck: 'exit 1' });

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-shell', files: ['brew.sh'] },
        sandbox.env,
      );

      return findRunFault(run, {
        exitCode: 0,
        output: 'shell: skipped, because shfmt is not on the PATH; CI runs the check\n',
      });
    },
  },
  {
    title: 'the shell job fails when shellcheck fails a file that shfmt passes',
    check: async (sandbox) => {
      await writeStubPrograms(sandbox.bin, {
        shellcheck: 'echo "brew.sh:2: SC2086 double quote to prevent globbing"\nexit 1',
        shfmt: 'exit 0',
      });

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-shell', files: ['brew.sh'] },
        sandbox.env,
      );

      return findRunFault(run, {
        exitCode: 1,
        output: 'brew.sh:2: SC2086 double quote to prevent globbing\n',
      });
    },
  },
  {
    title:
      'the workflows job runs the workflow lint with a notice when the machine lacks actionlint, and fails when the lint fails',
    check: async (sandbox) => {
      await writeStubPrograms(join(sandbox.repo, 'node_modules/.bin'), {
        chex: 'echo "$1: $2 runs no job"\necho "bounced: $1"\nexit 1',
      });

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-workflows', files: ['.github/workflows/brew.yml'] },
        sandbox.env,
      );

      return findRunFault(run, {
        exitCode: 1,
        output: [
          'workflows: actionlint skipped, because it is not on the PATH; CI runs it',
          'workflows: .github/workflows/brew.yml runs no job',
          'bounced: workflows',
          '',
        ].join('\n'),
      });
    },
  },
  {
    title: 'the workflows job fails when actionlint fails a file that the workflow lint passes',
    check: async (sandbox) => {
      await writeStubPrograms(sandbox.bin, {
        actionlint: 'echo ".github/workflows/brew.yml:3:5: unknown key \\"stepz\\""\nexit 1',
      });

      await writeStubPrograms(join(sandbox.repo, 'node_modules/.bin'), { chex: 'exit 0' });

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-workflows', files: ['.github/workflows/brew.yml'] },
        sandbox.env,
      );

      return findRunFault(run, {
        exitCode: 1,
        output: '.github/workflows/brew.yml:3:5: unknown key "stepz"\n',
      });
    },
  },
  {
    title:
      'the docs job fails in a repo with no check:docs script, since the repo names its docs checks',
    check: async (sandbox) => {
      await writeFile(join(sandbox.repo, 'package.json'), JSON.stringify({ scripts: {} }));

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-docs', files: ['README.md'] },
        sandbox.env,
      );

      return run.exitCode !== 0 && run.output.includes('check:docs')
        ? null
        : `it exited ${run.exitCode} without naming check:docs: ${run.output.trim()}`;
    },
  },
  {
    title: 'the uncommitted job fails and downloads nothing when the repo does not install chex',
    check: async (sandbox) => {
      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-uncommitted', files: [] },
        sandbox.env,
      );

      return run.exitCode !== 0 &&
        run.output.includes(
          "Could not find an existing 'chex' binary to run. Stopping because --no-install was passed.",
        )
        ? null
        : `it exited ${run.exitCode} without refusing to download chex: ${run.output.trim()}`;
    },
  },
  {
    title:
      "the test job runs the related tests through rig without git's repository variables that a pre-push in a worktree exports",
    check: async (sandbox) => {
      await writeStubPrograms(join(sandbox.repo, 'node_modules/.bin'), {
        rig: 'env > rig-env\necho "$*" > rig-call',
      });

      const run = await sandbox.runJob(
        { hook: 'pre-push', name: 'chex-test', files: ['kettle.ts'] },
        { ...sandbox.env, GIT_DIR: '/srv/kettle/.git/worktrees/lid', GIT_WORK_TREE: '/srv/lid' },
      );

      if (run.exitCode !== 0) {
        return `it exited ${run.exitCode}: ${run.output.trim()}`;
      }

      const rigEnv = await readFile(join(sandbox.repo, 'rig-env'), 'utf8');
      const rigCall = await readFile(join(sandbox.repo, 'rig-call'), 'utf8');

      const kept = rigEnv.split('\n').filter((line) => line.startsWith('GIT_'));

      if (kept.length > 0) {
        return `rig ran with ${kept.join(', ')}`;
      }

      return rigCall === 'related kettle.ts\n' ? null : `rig ran as: rig ${rigCall.trim()}`;
    },
  },
  {
    title: 'the typecheck job skips a commit that stages no code or config file',
    check: async (sandbox) => {
      const gitEnv = readGitEnv(sandbox.repo, `${sandbox.bin}:${process.env['PATH'] ?? ''}`);

      await $`git init --quiet --initial-branch=main ${sandbox.repo}`.env(gitEnv).quiet();

      await mkdir(join(sandbox.repo, 'node_modules/@zgeoff'), { recursive: true });
      await symlink(chexFolder, join(sandbox.repo, 'node_modules/@zgeoff/chex'));

      await writeFile(
        join(sandbox.repo, 'lefthook.yml'),
        'extends:\n  - node_modules/@zgeoff/chex/lefthook.yml\n',
      );

      await writeFile(
        join(sandbox.repo, 'package.json'),
        JSON.stringify({ scripts: { typecheck: 'exit 1' } }),
      );

      await writeFile(join(sandbox.repo, 'notes.md'), '# Notes\n');

      await $`git add notes.md`.cwd(sandbox.repo).env(gitEnv).quiet();

      const result = await $`${process.execPath} ${lefthookPath} run pre-commit`
        .cwd(sandbox.repo)
        .env(gitEnv)
        .nothrow()
        .quiet();

      const output = result.stdout.toString();

      return result.exitCode === 0 &&
        output.includes('chex-typecheck (skip) no matching staged files')
        ? null
        : `lefthook exited ${result.exitCode} without skipping typecheck: ${output.trim()}`;
    },
  },
];

function findRunFault(run: BaselineJobRun, expected: BaselineJobRun): string | null {
  return run.exitCode === expected.exitCode && run.output === expected.output
    ? null
    : `expected exit ${expected.exitCode} with ${JSON.stringify(expected.output)}, got exit ${run.exitCode} with ${JSON.stringify(run.output)}`;
}

// git reads no global or system config, and a mise shim on the PATH still finds its installs under
// the real HOME.
function readGitEnv(home: string, path: string): Record<string, string | undefined> {
  const realHome = process.env['HOME'] ?? home;

  return {
    PATH: path,
    HOME: home,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Check',
    GIT_AUTHOR_EMAIL: 'check@example.com',
    GIT_COMMITTER_NAME: 'Check',
    GIT_COMMITTER_EMAIL: 'check@example.com',
    MISE_DATA_DIR:
      process.env['MISE_DATA_DIR'] ??
      join(process.env['XDG_DATA_HOME'] ?? join(realHome, '.local', 'share'), 'mise'),
    MISE_STATE_DIR:
      process.env['MISE_STATE_DIR'] ??
      join(process.env['XDG_STATE_HOME'] ?? join(realHome, '.local', 'state'), 'mise'),
  };
}
