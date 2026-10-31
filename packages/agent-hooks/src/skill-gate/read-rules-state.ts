import { readFile, stat } from 'node:fs/promises';
import { isRecord } from '@zgeoff/std';
import type { RulesState } from './types.ts';

// Bun.file(...).exists() is false for a folder, so the gate stats the path instead.
export async function readRulesState(rulesPath: string): Promise<RulesState> {
  try {
    const stats = await stat(rulesPath);

    if (stats.isDirectory()) {
      return { kind: 'unreadable', reason: 'it is a folder', code: 'EISDIR' };
    }

    if (!stats.isFile()) {
      return { kind: 'unreadable', reason: 'it is not a regular file', code: null };
    }

    return { kind: 'readable', text: await readFile(rulesPath, 'utf8') };
  } catch (error) {
    const code = isRecord(error) && typeof error['code'] === 'string' ? error['code'] : null;

    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { kind: 'missing' };
    }

    return { kind: 'unreadable', reason: formatReadError(error, code), code };
  }
}

// A Node fs error message ends with the syscall and the path, such as
// "EACCES: permission denied, open '<path>'", and the denial names the path itself.
function formatReadError(error: unknown, code: string | null): string {
  const message = error instanceof Error ? error.message : String(error);
  const [summary = message] = message.split(', ');

  return code === null || summary.startsWith(`${code}:`) ? summary : `${code}: ${summary}`;
}
