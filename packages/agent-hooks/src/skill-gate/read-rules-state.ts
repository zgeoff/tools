import { isRecord } from '@zgeoff/std';
import type { RulesFileSystem, RulesState } from './types.ts';

// Bun.file(...).exists() is false for a folder, so the gate stats the path instead.
export async function readRulesState(
  fileSystem: RulesFileSystem,
  rulesPath: string,
): Promise<RulesState> {
  try {
    const stats = await fileSystem.stat(rulesPath);

    if (stats.isDirectory()) {
      return { kind: 'unreadable', reason: 'it is a folder', cause: 'folder' };
    }

    if (!stats.isFile()) {
      return { kind: 'unreadable', reason: 'it is not a regular file', cause: 'other' };
    }
  } catch (error) {
    const code = readErrorCode(error);

    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { kind: 'missing' };
    }

    return { kind: 'unreadable', reason: formatReadError(error, code), cause: 'other' };
  }

  return readRulesText(fileSystem, rulesPath);
}

function readErrorCode(error: unknown): string | null {
  return isRecord(error) && typeof error['code'] === 'string' ? error['code'] : null;
}

// A Node fs error message ends with the syscall and the path, such as
// "EACCES: permission denied, open '<path>'", and the denial names the path itself.
function formatReadError(error: unknown, code: string | null): string {
  const message = error instanceof Error ? error.message : String(error);
  const [summary = message] = message.split(', ');

  return code === null || summary.startsWith(`${code}:`) ? summary : `${code}: ${summary}`;
}

async function readRulesText(fileSystem: RulesFileSystem, rulesPath: string): Promise<RulesState> {
  try {
    return { kind: 'readable', text: await fileSystem.readText(rulesPath) };
  } catch (error) {
    const code = readErrorCode(error);

    return {
      kind: 'unreadable',
      reason: formatReadError(error, code),
      cause: code === 'EACCES' ? 'file-permission' : 'other',
    };
  }
}
