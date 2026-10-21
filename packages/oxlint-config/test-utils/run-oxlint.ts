import { join } from 'node:path';

export interface OxlintRun {
  exitCode: number;
  stdout: string;
}

export async function runOxlint(args: readonly string[], cwd: string): Promise<OxlintRun> {
  const oxlintBin = join(import.meta.dir, '..', '..', '..', 'node_modules', '.bin', 'oxlint');
  const subprocess = Bun.spawn([oxlintBin, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
  ]);

  return { exitCode, stdout };
}
