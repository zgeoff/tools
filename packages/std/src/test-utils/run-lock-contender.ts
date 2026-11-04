import { join } from 'node:path';

export interface LockContenderOptions {
  readonly lockPath: string;

  // The file the contender appends `start <name>` and `end <name>` lines to while it holds the lock.
  readonly logPath: string;

  readonly name: string;

  readonly waitMs: number;
}

const withFileLockPath = join(import.meta.dir, '..', 'with-file-lock.ts');

// Runs withFileLock in another process, and resolves with the kind of its result.
export async function runLockContender(options: LockContenderOptions): Promise<string> {
  const script = [
    "const { appendFileSync } = await import('node:fs');",
    `const { withFileLock } = await import(${JSON.stringify(withFileLockPath)});`,
    `const logPath = ${JSON.stringify(options.logPath)};`,
    `const name = ${JSON.stringify(options.name)};`,
    `const result = await withFileLock(${JSON.stringify(options.lockPath)}, async () => {`,
    String.raw`  appendFileSync(logPath, 'start ' + name + '\n');`,
    '  await Bun.sleep(20);',
    String.raw`  appendFileSync(logPath, 'end ' + name + '\n');`,
    `}, { waitMs: ${String(options.waitMs)} });`,
    'process.stdout.write(result.kind);',
  ].join('\n');

  const contender = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe' });

  const [output, exitCode] = await Promise.all([
    new Response(contender.stdout).text(),
    contender.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`the lock contender ${options.name} exited with ${String(exitCode)}`);
  }

  return output;
}
