#!/usr/bin/env bun
import { rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { readOptionalText } from '@zgeoff/std';
import { runCIPlanCommand } from './ci-plan/write-check-plan.ts';
import { makeCheckRunner } from './cli/make-check-runner.ts';
import { runChex } from './cli/run-chex.ts';
import { runCommitsCommand } from './commits/run-commits-check.ts';
import { runDependencyGatesCommand } from './dependency-gates/run-dependency-gates-check.ts';
import { runInit } from './init/run-init.ts';
import { runLocalPathsCommand } from './local-paths/run-local-paths-check.ts';
import { writeTextFile } from './output/write-text-file.ts';
import { runTestLayoutCommand } from './test-layout/run-test-layout-check.ts';
import { runTestTimeoutsCommand } from './test-timeouts/run-test-timeouts-check.ts';
import { runUncommittedCommand } from './uncommitted/run-uncommitted-check.ts';
import { runWorkflowsCommand } from './workflows/run-workflows-check.ts';

process.exitCode = await runChex(process.argv.slice(2), {
  runCheck: makeCheckRunner({
    docsFolder: join(import.meta.dir, 'docs'),
    runScript: (argv) => Bun.spawn([...argv], { stdio: ['inherit', 'inherit', 'inherit'] }).exited,
    repoChecks: {
      commits: runCommitsCommand,
      'local-paths': runLocalPathsCommand,
      'test-timeouts': runTestTimeoutsCommand,
      'test-layout': runTestLayoutCommand,
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
  runCIPlan: runCIPlanCommand,
  writeOutput: (text) => {
    process.stdout.write(text);
  },
  writeError: (text) => {
    process.stderr.write(text);
  },
});
