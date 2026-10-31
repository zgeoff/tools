#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { availableParallelism, totalmem } from 'node:os';
import { wireBrowserLaneHooks } from './browser/wire-browser-lane-hooks.ts';
import { initFiles } from './init-files.ts';
import { readOptionalText } from './read-memory-budget.ts';
import { readRigConfig } from './read-rig-config.ts';
import { readTrackedFiles } from './read-tracked-files.ts';
import { readWorkerCount } from './read-worker-count.ts';
import { resolveDietScript } from './resolve-diet-script.ts';
import { runCLI } from './run-cli.ts';
import { runCommand } from './run-command.ts';

// A signal stops the run's processes through the abort, and the run waits for them to exit before
// it returns, so a lane's stop hook and folder cleanup still run.
const controller = new AbortController();

function handleSignal() {
  controller.abort();
}

process.on('SIGINT', handleSignal);
process.on('SIGTERM', handleSignal);
process.on('SIGHUP', handleSignal);

const output = {
  out: (text: string) => {
    process.stdout.write(text);
  },
  err: (text: string) => {
    process.stderr.write(text);
  },
};

// `bun run` starts a package script in the folder of the package that defines it.
const repoRoot = process.cwd();

try {
  process.exitCode = await runCLI(
    process.argv.slice(2),
    {
      repoRoot,
      environment: process.env,
      signal: controller.signal,
      runID: String(process.pid),
    },
    {
      dietScript: resolveDietScript(),
      output,
      sources: { cwd: repoRoot, probeFile: existsSync },
      readConfig: (root) =>
        readRigConfig(root, { probeFile: existsSync, importModule: (path) => import(path) }),
      readTrackedFiles,
      initFiles,
      readWorkerCount: () =>
        readWorkerCount({
          env: process.env,
          cores: availableParallelism(),
          totalMemory: totalmem(),
          procRoot: '/proc',
          cgroupRoot: '/sys/fs/cgroup',
          readText: readOptionalText,
        }),
      importModule: (path) => import(path),
      runCommand,
      wireBrowserLaneHooks,
    },
  );
} catch (error) {
  console.error('rig:', error);

  process.exitCode = 1;
}
