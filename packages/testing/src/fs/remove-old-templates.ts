import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { removeFolder } from './remove-folder.ts';

const unusedLimitMs = 60 * 60 * 1000;

// Removes each other template of the same name that no readTemplate call has marked as used for an
// hour, with its marker. Staging folders of builds that died are removed on the same terms.
export function removeOldTemplates(
  templatesRoot: string,
  name: string,
  keptFolder: string,
  nowMs: number,
): void {
  const pattern = new RegExp(`^${escapeRegExp(name)}-[0-9a-f]{16}(?<staging>\\.staging-.*)?$`, 'u');

  for (const entry of readdirSync(templatesRoot)) {
    if (entry === keptFolder || !pattern.test(entry)) {
      continue;
    }

    const lastUsedMs = readLastUsedMs(templatesRoot, entry);

    if (lastUsedMs !== null && nowMs - lastUsedMs > unusedLimitMs) {
      removeFolder(join(templatesRoot, entry));
      removeFolder(join(templatesRoot, `${entry}.used`));
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);
}

function readLastUsedMs(templatesRoot: string, entry: string): number | null {
  for (const path of [join(templatesRoot, `${entry}.used`), join(templatesRoot, entry)]) {
    try {
      return statSync(path).mtimeMs;
    } catch {
      continue;
    }
  }

  return null;
}
