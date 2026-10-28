import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { parseRenovateVersion } from './parse-renovate-version.ts';

export interface RenovateConfigCheck {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: FileSystem;

  // Runs the validator, whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;
}

// Returns the validator's exit code.
export async function runRenovateConfigCheck(
  check: Readonly<RenovateConfigCheck>,
): Promise<number> {
  const workflowText = await check.fileSystem.readText(
    join(check.cwd, '.github/workflows/renovate.yml'),
  );

  const version = parseRenovateVersion(workflowText);

  const result = await check.runLoggedCommand(
    [
      'npx',
      '--yes',
      '--package',
      `renovate@${version}`,
      '--',
      'renovate-config-validator',
      '--strict',
      '--no-global',
      'default.json',
    ],
    { cwd: check.cwd, env: check.env },
  );

  return result.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runRenovateConfigCheck({
    cwd: process.cwd(),
    env: process.env,
    fileSystem: nodeFileSystem,
    runLoggedCommand: makeLoggedCommandRunner({ stdout: process.stdout, stderr: process.stderr }),
  });
}
