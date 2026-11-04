import { join } from 'node:path';
import { readStreamUntil } from '@zgeoff/testing/helpers';

export interface LockHolder {
  readonly pid: number;

  // Ends the holder's callback, so withFileLock lets go, and waits for the process to exit.
  readonly release: () => Promise<void>;

  // Kills the holder with SIGKILL and waits for its exit.
  readonly kill: () => Promise<void>;
}

const withFileLockPath = join(import.meta.dir, '..', 'with-file-lock.ts');

// Another process that holds the lock through withFileLock until its stdin closes or it dies.
export async function createLockHolder(lockPath: string): Promise<LockHolder> {
  const script = [
    `const { withFileLock } = await import(${JSON.stringify(withFileLockPath)});`,
    `const result = await withFileLock(${JSON.stringify(lockPath)}, async () => {`,
    "  console.log('held');",
    '  for await (const _ of Bun.stdin.stream()) {}',
    '});',
    'console.log(result.kind);',
  ].join('\n');

  const holder = Bun.spawn([process.execPath, '-e', script], { stdin: 'pipe', stdout: 'pipe' });

  const output = await readStreamUntil(holder.stdout, '\n');

  if (output !== 'held\n') {
    holder.kill('SIGKILL');
    throw new Error(`the lock holder could not take the lock ${lockPath}: ${output}`);
  }

  const isRunning = (): boolean => holder.exitCode === null && holder.signalCode === null;

  return {
    pid: holder.pid,
    release: async () => {
      if (isRunning()) {
        await holder.stdin.end();
      }

      await holder.exited;
    },
    kill: async () => {
      if (isRunning()) {
        holder.kill('SIGKILL');
      }

      await holder.exited;
    },
  };
}
