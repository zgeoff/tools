#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { runDependencyGatesCommand } from './dependency-gates/run-dependency-gates-check.ts';
import { makeCheckRunner } from './make-check-runner.ts';
import { runChex } from './run-chex.ts';
import { runCommitsCommand } from './run-commits-check.ts';
import { runInit } from './run-init.ts';
import { runLocalPathsCommand } from './run-local-paths-check.ts';
import { runTestTimeoutsCommand } from './run-test-timeouts-check.ts';
import { runUncommittedCommand } from './run-uncommitted-check.ts';
import { runWorkflowsCommand } from './run-workflows-check.ts';

// A reusable workflow downloads this file and every file it imports, with no install, so it and
// its imports import no package.
process.exitCode = await runChex(process.argv.slice(2), {
  runCheck: makeCheckRunner({
    docsFolder: join(import.meta.dir, 'docs'),
    runScript: (argv) => Bun.spawn([...argv], { stdio: ['inherit', 'inherit', 'inherit'] }).exited,
    repoChecks: {
      commits: runCommitsCommand,
      'local-paths': runLocalPathsCommand,
      'test-timeouts': runTestTimeoutsCommand,
      workflows: runWorkflowsCommand,
      'dependency-gates': runDependencyGatesCommand,
      uncommitted: runUncommittedCommand,
    },
  }),
  runInit: () =>
    runInit({
      repoRoot: process.cwd(),
      readText: async (path) => {
        const exists = await Bun.file(path).exists();

        return exists ? readFile(path, 'utf8') : null;
      },
      writeText: async (path, text) => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, text);
      },
      writeOutput: (text) => {
        process.stdout.write(text);
      },
      writeError: (text) => {
        process.stderr.write(text);
      },
    }),
  writeOutput: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  },
});
