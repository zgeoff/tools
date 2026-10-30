import { join } from 'node:path';
import { firstPartyScopes } from '../../sync/pre-push/dependency-gates/first-party-scopes.ts';
import type { FileSystem } from '../ci/file-system.ts';
import { makeLoggedCommandRunner } from '../ci/make-logged-command-runner.ts';
import { nodeFileSystem } from '../ci/node-file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { findFirstPartyScopeDrift } from './find-first-party-scope-drift.ts';
import { parseRenovateVersion } from './parse-renovate-version.ts';

export interface RenovateConfigCheck {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly fileSystem: Pick<FileSystem, 'readText'>;

  // Runs the validator, whose output the log shows as it runs.
  readonly runLoggedCommand: RunCommand;

  readonly writeError: (text: string) => void;
}

export async function runRenovateConfigCheck(
  check: Readonly<RenovateConfigCheck>,
): Promise<number> {
  const presetText = await check.fileSystem.readText(join(check.cwd, 'default.json'));

  const drift = findFirstPartyScopeDrift(presetText, firstPartyScopes);

  if (drift !== undefined) {
    check.writeError(`${drift}\n`);

    return 1;
  }

  const workflowText = await check.fileSystem.readText(
    join(check.cwd, '.github/workflows/renovate.yml'),
  );

  const parsed = parseRenovateVersion(workflowText);

  if (parsed.kind === 'invalid') {
    check.writeError(`.github/workflows/renovate.yml: ${parsed.message}\n`);

    return 1;
  }

  const result = await check.runLoggedCommand(
    [
      'npx',
      '--yes',
      '--package',
      `renovate@${parsed.version}`,
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
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
