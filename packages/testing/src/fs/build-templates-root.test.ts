import { expect, test } from 'bun:test';
import { buildTemplatesRoot } from './build-templates-root.ts';

test.each([
  { cacheHome: '/var/cache/ada', root: '/var/cache/ada/zgeoff-testing/templates' },
  { cacheHome: undefined, root: '/home/ada/.cache/zgeoff-testing/templates' },
  { cacheHome: '', root: '/home/ada/.cache/zgeoff-testing/templates' },
  { cacheHome: 'relative/cache', root: '/home/ada/.cache/zgeoff-testing/templates' },
])('it puts the cache in $root when XDG_CACHE_HOME is $cacheHome', (row) => {
  expect(buildTemplatesRoot({ XDG_CACHE_HOME: row.cacheHome }, '/home/ada')).toBe(row.root);
});
