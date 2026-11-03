export interface CacheEntry {
  readonly kind: 'template' | 'readers' | 'build';

  readonly templateName: string;
}

const hexKeyPattern = /^[0-9a-f]+$/u;

export function parseCacheEntry(name: string, entry: string): CacheEntry | null {
  const prefix = `${name}-`;

  if (!entry.startsWith(prefix)) {
    return null;
  }

  const [key = '', ...suffixes] = entry.slice(prefix.length).split('.');
  const suffix = suffixes.join('.');

  if (!hexKeyPattern.test(key)) {
    return null;
  }

  const templateName = `${prefix}${key}`;

  if (suffix === '') {
    return { kind: 'template', templateName };
  }

  if (suffix === 'readers') {
    return { kind: 'readers', templateName };
  }

  if (suffix.startsWith('building-')) {
    return { kind: 'build', templateName };
  }

  return null;
}
