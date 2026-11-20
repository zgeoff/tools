import { posix } from 'node:path';
import type { SourceFile } from './types.ts';

export interface TestPreloads {
  readonly preloads: string[];

  readonly faults: string[];
}

// Reads the `[test] preload` list of each bunfig.toml. A relative entry names a test file, resolved
// against the folder of its bunfig.toml; a bare package name is skipped.
export function collectTestPreloads(bunfigs: readonly SourceFile[]): TestPreloads {
  const preloads: string[] = [];
  const faults: string[] = [];

  for (const bunfig of bunfigs) {
    let parsed: unknown;

    try {
      parsed = Bun.TOML.parse(bunfig.text);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      faults.push(
        `${bunfig.path} does not parse, so the layout check cannot read its test preloads: ${reason}; fix the TOML`,
      );

      continue;
    }

    for (const entry of pickPreloadEntries(parsed)) {
      if (entry.startsWith('./') || entry.startsWith('../')) {
        const joined = posix.join(posix.dirname(bunfig.path), entry);

        preloads.push(posix.normalize(joined));
      }
    }
  }

  return { preloads, faults };
}

function pickPreloadEntries(parsed: unknown): string[] {
  const section: unknown =
    typeof parsed === 'object' && parsed !== null ? Reflect.get(parsed, 'test') : null;

  const list: unknown =
    typeof section === 'object' && section !== null ? Reflect.get(section, 'preload') : null;

  if (typeof list === 'string') {
    return [list];
  }

  return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
}
