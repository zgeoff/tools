import { join } from 'node:path';
import type { FileSystem } from '../ci/file-system.ts';
import { nodeFileSystem } from '../ci/file-system.ts';
import type { RunCommand } from '../ci/run-command.ts';
import { runLoggedCommand } from '../ci/run-logged-command.ts';

// The validator runs at the Renovate version the scheduled run pins, so it reads the preset as
// that run does.
export function parseRenovateVersion(workflowText: string): string {
  const workflow: unknown = Bun.YAML.parse(workflowText);
  const steps = findMember(findMember(findMember(workflow, 'jobs'), 'renovate'), 'steps');

  const versions = (Array.isArray(steps) ? steps : []).flatMap((step: unknown) => {
    const version = findMember(findMember(step, 'with'), 'renovate-version');

    return typeof version === 'string' ? [version] : [];
  });

  const [version] = versions;

  if (version === undefined || versions.length > 1) {
    throw new Error(
      `the renovate job holds ${versions.length} renovate-version inputs; the check reads exactly one`,
    );
  }

  return version;
}

function findMember(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const members: [string, unknown][] = Object.entries(value);

  return members.find(([name]) => name === key)?.[1];
}

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
    runLoggedCommand,
  });
}
