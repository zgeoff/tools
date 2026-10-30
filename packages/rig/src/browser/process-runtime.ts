export interface SpawnedProcess {
  readonly pid: number;

  readonly stdout: ReadableStream<Uint8Array> | null;

  readonly exited: Promise<number>;
}

export interface SpawnOptions {
  readonly cwd: string;

  readonly environment: Readonly<Record<string, string | undefined>>;

  readonly stdout: 'inherit' | 'pipe';
}

export interface ProcessRuntime {
  readonly now: () => number;

  readonly sleep: (durationMs: number) => Promise<void>;

  // Starts the command as the leader of a process group of its own.
  readonly spawn: (command: readonly string[], options: SpawnOptions) => SpawnedProcess;
}

export const processRuntime: ProcessRuntime = {
  spawn: (command, options) => {
    const child = Bun.spawn([...command], {
      cwd: options.cwd,
      env: options.environment,
      detached: true,
      stderr: 'inherit',
      stdin: 'inherit',
      stdout: options.stdout,
    });

    return { pid: child.pid, stdout: child.stdout ?? null, exited: child.exited };
  },
  now: () => Date.now(),
  sleep: (durationMs) => Bun.sleep(durationMs),
};
