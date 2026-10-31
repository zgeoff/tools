#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { makeCheckRunner } from './make-check-runner.ts';
import { runChex } from './run-chex.ts';
import { runInit } from './run-init.ts';

// A reusable workflow downloads this file and every file it imports, with no install, so it and
// its imports import no package.
process.exitCode = await runChex(process.argv.slice(2), {
  runCheck: makeCheckRunner({
    docsFolder: join(import.meta.dir, 'docs'),
    runScript: (argv) => Bun.spawn([...argv], { stdio: ['inherit', 'inherit', 'inherit'] }).exited,
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
