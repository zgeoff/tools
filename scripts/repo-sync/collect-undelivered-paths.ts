import { isDeepStrictEqual } from 'node:util';
import { isRecord } from '../../packages/std/src/is-record.ts';

export interface SyncBranchChange {
  // Every path the sync branch changes against the commit it starts from.
  readonly changed: readonly string[];

  // The targets the run copied and the retired copies it removed.
  readonly delivered: readonly string[];

  // Each package.json script that a build of the run writes, with the value it writes.
  readonly scripts: Readonly<Record<string, string>>;

  // The package.json text before and after the run; null when the branch leaves it alone or a side
  // lacks it.
  readonly packageJSON: { readonly before: string; readonly after: string } | null;
}

// A build may rewrite package.json, so that file counts as delivered when its only change sets the
// scripts the manifest declares for the build.
export function collectUndeliveredPaths(change: Readonly<SyncBranchChange>): string[] {
  const delivered = new Set(change.delivered);

  return change.changed.filter(
    (path) =>
      !delivered.has(path) &&
      !(
        path === 'package.json' &&
        change.packageJSON !== null &&
        isDeclaredScriptsChange(change.packageJSON.before, change.packageJSON.after, change.scripts)
      ),
  );
}

function isDeclaredScriptsChange(
  beforeText: string,
  afterText: string,
  scripts: Readonly<Record<string, string>>,
): boolean {
  const before = parsePackageJSON(beforeText);
  const after = parsePackageJSON(afterText);
  const beforeScripts = before === null ? null : findScripts(before);
  const afterScripts = after === null ? null : findScripts(after);

  if (before === null || after === null || beforeScripts === null || afterScripts === null) {
    return false;
  }

  const isEachScriptDeclared = Object.entries(scripts).every(
    ([key, value]) => afterScripts[key] === value || afterScripts[key] === beforeScripts[key],
  );

  return (
    isEachScriptDeclared &&
    isDeepStrictEqual(
      buildWithoutScripts(before, beforeScripts, scripts),
      buildWithoutScripts(after, afterScripts, scripts),
    )
  );
}

function parsePackageJSON(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);

    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function findScripts(
  packageJSON: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const scripts = packageJSON['scripts'] ?? {};

  return isRecord(scripts) ? scripts : null;
}

function buildWithoutScripts(
  packageJSON: Readonly<Record<string, unknown>>,
  packageScripts: Readonly<Record<string, unknown>>,
  scripts: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const keptScripts = Object.fromEntries(
    Object.entries(packageScripts).filter(([key]) => !Object.hasOwn(scripts, key)),
  );

  return { ...packageJSON, scripts: keptScripts };
}
