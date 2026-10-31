#!/usr/bin/env bun
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readOptionalText } from '@zgeoff/std';
import { runDependencyGatesCommand } from './dependency-gates/run-dependency-gates-check.ts';
import { makeCheckRunner } from './make-check-runner.ts';
import { runChex } from './run-chex.ts';
import { runCommitsCommand } from './run-commits-check.ts';
import { runInit } from './run-init.ts';
import { runLocalPathsCommand } from './run-local-paths-check.ts';
import { runTestTimeoutsCommand } from './run-test-timeouts-check.ts';
import { runUncommittedCommand } from './run-uncommitted-check.ts';
import { runWorkflowsCommand } from './run-workflows-check.ts';
import { writeTextFile } from './write-text-file.ts';

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
      readText: readOptionalText,
      writeText: writeTextFile,
      renameFile: (from, to) => rename(from, to),
      removeFile: (path) => rm(path, { force: true }),
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
