import { isRecord } from '@zgeoff/std';

// The baseline's jobs run chex, the related tests through rig, and each job under diet's memory cap.
export const baselinePackages = ['@zgeoff/chex', '@zgeoff/rig', '@zgeoff/diet'] as const;
export const docsScript = 'chex prose length links';

export type PackageOutcome =
  | { readonly kind: 'missing'; readonly packages: readonly string[] }
  | { readonly kind: 'unchanged' }
  | { readonly kind: 'changed'; readonly text: string }
  | { readonly kind: 'refused'; readonly reason: string };

export function buildInitPackage(text: string): PackageOutcome {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      kind: 'refused',
      reason: `package.json is not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!isRecord(parsed)) {
    return { kind: 'refused', reason: 'package.json is not a JSON object' };
  }

  const installed = new Set([
    ...listKeys(parsed['dependencies']),
    ...listKeys(parsed['devDependencies']),
  ]);

  const missing = baselinePackages.filter((name) => !installed.has(name));

  if (missing.length > 0) {
    return { kind: 'missing', packages: missing };
  }

  const scripts = parsed['scripts'] ?? {};

  if (!isRecord(scripts)) {
    return { kind: 'refused', reason: 'the scripts of package.json are not a JSON object' };
  }

  if (scripts['check:docs'] !== undefined) {
    return { kind: 'unchanged' };
  }

  const edited = { ...parsed, scripts: { ...scripts, 'check:docs': docsScript } };

  return { kind: 'changed', text: `${JSON.stringify(edited, null, 2)}\n` };
}

function listKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}
