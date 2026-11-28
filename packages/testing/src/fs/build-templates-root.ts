import { isAbsolute, join } from 'node:path';

// The XDG base directory spec ignores a relative XDG_CACHE_HOME, and falls back to ~/.cache.
export function buildTemplatesRoot(
  environment: Readonly<Record<string, string | undefined>>,
  homeFolder: string,
): string {
  const cacheHome = environment['XDG_CACHE_HOME'];

  const cacheRoot =
    cacheHome !== undefined && isAbsolute(cacheHome) ? cacheHome : join(homeFolder, '.cache');

  return join(cacheRoot, 'zgeoff-testing', 'templates');
}
