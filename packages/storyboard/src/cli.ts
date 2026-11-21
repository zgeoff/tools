#!/usr/bin/env bun
import { readRepoRoot } from './commands/read-repo-root.ts';
import { runBuildCommand } from './commands/run-build-command.ts';
import { runNewCommand } from './commands/run-new-command.ts';

const USAGE = 'usage: storyboard build | storyboard new <scene>';

async function runCLI(args: readonly string[]): Promise<number> {
  const [command, sceneName] = args;

  try {
    if (command === 'build' && args.length === 1) {
      const written = await runBuildCommand(readRepoRoot(process.cwd()));

      for (const path of written) {
        console.log(`wrote ${path}`);
      }

      return 0;
    }

    if (command === 'new' && sceneName !== undefined && args.length === 2) {
      const steps = await runNewCommand(readRepoRoot(process.cwd()), sceneName);

      console.log(`wrote scripts/storyboard/${sceneName}/`);

      if (steps.length > 0) {
        console.log('Next steps:');
      }

      for (const [index, step] of steps.entries()) {
        console.log(`${index + 1}. ${step}`);
      }

      return 0;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error(message);

    return 1;
  }

  console.error(USAGE);

  return 2;
}

process.exitCode = await runCLI(process.argv.slice(2));
