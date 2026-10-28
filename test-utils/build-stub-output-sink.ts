export interface StubOutputSink {
  readonly write: (chunk: Uint8Array) => void;

  // The text of every chunk written so far. A character whose bytes span two chunks appears once
  // its last byte arrives.
  readonly readText: () => string;

  // Settles at the first write, so a test can act while the writer still runs.
  readonly firstWrite: Promise<void>;
}

// Stands in for process.stdout or process.stderr, as a logged command runner writes to them.
export function buildStubOutputSink(): StubOutputSink {
  const decoder = new TextDecoder();

  const chunks: string[] = [];
  const firstWrite = Promise.withResolvers<void>();

  return {
    write: (chunk) => {
      chunks.push(decoder.decode(chunk, { stream: true }));
      firstWrite.resolve();
    },
    readText: () => chunks.join(''),
    firstWrite: firstWrite.promise,
  };
}
