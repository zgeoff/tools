import { mkdirSync } from 'node:fs';
import { createStubBin } from '@zgeoff/testing/bin';

// Writes each program as a stand-in that runs the sh body, in a folder it creates.
export function writeStubPrograms(folder: string, bodies: Readonly<Record<string, string>>): void {
  mkdirSync(folder, { recursive: true });

  for (const [name, body] of Object.entries(bodies)) {
    createStubBin(folder, name, { script: `#!/bin/sh\n${body}\n` });
  }
}
