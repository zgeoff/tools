import { isRecord } from '@zgeoff/std';

export function hasBrowserBuildScript(manifest: unknown): boolean {
  const scripts = isRecord(manifest) ? manifest['scripts'] : null;

  return isRecord(scripts) && typeof scripts['build:browser'] === 'string';
}
