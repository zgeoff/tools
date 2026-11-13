// A path is beside the prefix when it is the prefix or lies under it, so
// `/api` covers `/api` and `/api/x` but not `/apiary`.
export function isBesidePrefix(path: string, prefix: string): boolean {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

  return path === base || path.startsWith(`${base}/`);
}
