import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

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

export async function runRenovateConfigCheck(cwd: string): Promise<number> {
  const workflowText = await readFile(join(cwd, '.github/workflows/renovate.yml'), 'utf8');

  const version = parseRenovateVersion(workflowText);

  const result =
    await $`npx --yes --package ${`renovate@${version}`} -- renovate-config-validator --strict --no-global default.json`
      .cwd(cwd)
      .nothrow();

  return result.exitCode;
}

if (import.meta.main) {
  process.exitCode = await runRenovateConfigCheck(process.cwd());
}
