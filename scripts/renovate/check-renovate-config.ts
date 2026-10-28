import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunCommand } from '../ci/run-command.ts';
import { runCommand } from '../ci/run-command.ts';

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

  readonly runCommand: RunCommand;

  readonly writeOutput: (text: string) => void;
}

export async function runRenovateConfigCheck(
  check: Readonly<RenovateConfigCheck>,
): Promise<number> {
  const workflowText = await readFile(join(check.cwd, '.github/workflows/renovate.yml'), 'utf8');

  const version = parseRenovateVersion(workflowText);

  const result = await check.runCommand(
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

  check.writeOutput(`${result.stdout}${result.stderr}`);

  return result.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runRenovateConfigCheck({
    cwd: process.cwd(),
    env: process.env,
    runCommand,
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
