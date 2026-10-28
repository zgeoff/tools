import { $ } from 'bun';

export interface PackageScriptsRun {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  // The planner's space-separated list, padded with spaces at both ends.
  readonly scripts: string;
}

// Runs each script in order, each in its own log group, and stops at the first that fails.
export async function runPackageScripts(run: Readonly<PackageScriptsRun>): Promise<number> {
  const names = run.scripts.split(/\s+/u).filter((name) => name !== '');

  for (const name of names) {
    process.stdout.write(`::group::bun run ${name}\n`);

    const result = await $`bun run ${name}`
      .cwd(run.cwd)
      .env({ ...run.env })
      .nothrow();

    process.stdout.write('::endgroup::\n');

    if (result.exitCode !== 0) {
      return result.exitCode;
    }
  }

  return 0;
}

if (import.meta.main) {
  process.exitCode = await runPackageScripts({
    cwd: process.cwd(),
    env: process.env,
    scripts: process.env['SCRIPTS'] ?? '',
  });
}
