import { join } from 'node:path';

// Reads a lane's limit through rig's own config reader in a fresh process, because a process
// imports a rig.config.ts once and keeps the first answer after the file changes.
export async function readRigLaneLimit(repoRoot: string, laneName: string): Promise<number> {
  const readerPath = join(import.meta.dir, '..', 'packages', 'rig', 'src', 'read-rig-config.ts');

  const script = [
    "import { existsSync } from 'node:fs';",
    `import { readRigConfig } from ${JSON.stringify(readerPath)};`,
    `const config = await readRigConfig(${JSON.stringify(repoRoot)}, { probeFile: existsSync, importModule: (path) => import(path) });`,
    `const lane = config.lanes.find((candidate) => candidate.name === ${JSON.stringify(laneName)});`,
    'console.log(JSON.stringify(lane?.limitMs ?? null));',
  ].join('\n');

  const reader = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe', stderr: 'pipe' });

  const [exitCode, stdout, stderr] = await Promise.all([
    reader.exited,
    new Response(reader.stdout).text(),
    new Response(reader.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`reading the rig config of ${repoRoot} failed: ${stderr}`);
  }

  const limitMs: unknown = JSON.parse(stdout);

  if (typeof limitMs !== 'number') {
    throw new TypeError(`the rig config of ${repoRoot} has no lane ${laneName}`);
  }

  return limitMs;
}
