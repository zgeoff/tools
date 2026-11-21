import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { StubCall } from './types.ts';

// Every call to every stand-in in the folder, in call order. A folder with no log reads as [].
export function readStubCalls(directory: string): readonly StubCall[] {
  const logPath = join(directory, 'calls.jsonl');

  if (!existsSync(logPath)) {
    return [];
  }

  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const call: unknown = JSON.parse(line);

      if (!isStubCall(call)) {
        throw new Error(`${logPath} holds a line that is no stub call: ${line}`);
      }

      return call;
    });
}

function isStubCall(value: unknown): value is StubCall {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'argv' in value &&
    Array.isArray(value.argv) &&
    'cwd' in value &&
    typeof value.cwd === 'string' &&
    'env' in value &&
    typeof value.env === 'object' &&
    'stdin' in value &&
    typeof value.stdin === 'string'
  );
}
