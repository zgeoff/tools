import { join } from 'node:path';

export interface OxlintRun {
  exitCode: number;
  stdout: string;
}

export async function runOxlint(args: readonly string[], cwd: string): Promise<OxlintRun> {
  const oxlintBin = join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'oxlint');

  // oxlint lints on a thread per core, so a test run with a worker per core would start a thread
  // per core per worker and starve the other tests; one thread changes no result.
  const subprocess = Bun.spawn([oxlintBin, '--threads=1', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const [exitCode, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
  ]);

  return { exitCode, stdout };
}
