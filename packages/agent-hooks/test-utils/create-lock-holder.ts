import { join } from 'node:path';
import { readStreamUntil } from './read-stream-until.ts';

export interface LockHolder {
  // Kills the holder with SIGKILL and waits for its exit, which frees its lock.
  readonly kill: () => Promise<void>;
}

const fileLocksPath = join(import.meta.dir, 'file-locks.ts');

// Another process that takes the lock and keeps it until it is killed.
export async function createLockHolder(lockPath: string): Promise<LockHolder> {
  const script = [
    `const { fileLocks } = await import(${JSON.stringify(fileLocksPath)});`,
    `const lockFile = await fileLocks.openLockFile(${JSON.stringify(lockPath)});`,
    "console.log(fileLocks.tryLock(lockFile) ? 'locked' : 'busy');",
    'await Bun.sleep(30_000);',
  ].join('\n');

  const holder = Bun.spawn([process.execPath, '-e', script], { stdout: 'pipe' });

  const output = await readStreamUntil(holder.stdout, '\n');

  if (output !== 'locked\n') {
    holder.kill('SIGKILL');
    throw new Error(`the lock holder could not take the lock ${lockPath}: ${output}`);
  }

  return {
    kill: async () => {
      if (holder.exitCode === null && holder.signalCode === null) {
        holder.kill('SIGKILL');
      }

      await holder.exited;
    },
  };
}
