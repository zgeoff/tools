export interface PackageScriptsRun {
  // The planner's space-separated list, padded with spaces at both ends.
  readonly scripts: string;

  // Runs one package script and returns its exit code.
  readonly runScript: (name: string) => Promise<number>;

  readonly writeOutput: (text: string) => void;
}

// Runs each script in order, each in its own log group, and stops at the first that fails.
export async function runPackageScripts(run: Readonly<PackageScriptsRun>): Promise<number> {
  const names = run.scripts.split(/\s+/u).filter((name) => name !== '');

  for (const name of names) {
    run.writeOutput(`::group::bun run ${name}\n`);

    const exitCode = await run.runScript(name);

    run.writeOutput('::endgroup::\n');

    if (exitCode !== 0) {
      return exitCode;
    }
  }

  return 0;
}

// A check script's output streams to the step's log as it runs, so the runner leaves the child's
// output on this process's own.
export function makeBunScriptRunner(
  cwd: string,
  env: Readonly<Record<string, string | undefined>>,
): (name: string) => Promise<number> {
  return (name) =>
    Bun.spawn(['bun', 'run', name], { cwd, env: { ...env }, stdout: 'inherit', stderr: 'inherit' })
      .exited;
}

if (import.meta.main) {
  process.exitCode = await runPackageScripts({
    scripts: process.env['SCRIPTS'] ?? '',
    runScript: makeBunScriptRunner(process.cwd(), process.env),
    writeOutput: (text) => {
      process.stdout.write(text);
    },
  });
}
