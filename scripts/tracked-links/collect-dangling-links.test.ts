import { expect, test } from 'bun:test';
import { collectDanglingLinks } from './collect-dangling-links.ts';

test.each([
  {
    condition: 'a tracked file sits in its target folder',
    link: { path: '.claude/skills', target: '../.agents/skills' },
    trackedPaths: ['.claude/skills', '.agents/skills/.gitkeep'],
  },
  {
    condition: 'its target is a tracked file',
    link: { path: 'sync/pre-push/parse-limits.ts', target: '../../packages/chex/parse-limits.ts' },
    trackedPaths: ['sync/pre-push/parse-limits.ts', 'packages/chex/parse-limits.ts'],
  },
  {
    condition: 'its target is a tracked link',
    link: { path: 'hooks/start.ts', target: 'start-link.ts' },
    trackedPaths: ['hooks/start.ts', 'hooks/start-link.ts'],
  },
])('it passes a link when $condition', (row) => {
  expect(collectDanglingLinks([row.link], row.trackedPaths)).toStrictEqual([]);
});

test.each([
  {
    condition: 'no tracked file sits in its target folder',
    link: { path: '.claude/skills', target: '../.agents/skills' },
    trackedPaths: ['.claude/skills', '.claude/settings.json'],
    resolved: '.agents/skills',
  },
  {
    condition: 'only a path that shares its name prefix is tracked',
    link: { path: 'docs/guide', target: 'guides' },
    trackedPaths: ['docs/guide', 'docs/guides-old/intro.md'],
    resolved: 'docs/guides',
  },
  {
    condition: 'its target leaves the repo',
    link: { path: 'vendor/lib', target: '../../shared/lib' },
    trackedPaths: ['vendor/lib', 'shared/lib/index.ts'],
    resolved: '../shared/lib',
  },
  {
    condition: 'its target is absolute',
    link: { path: 'bin/node', target: '/usr/bin/node' },
    trackedPaths: ['bin/node'],
    resolved: '/usr/bin/node',
  },
])('it reports a link when $condition', (row) => {
  expect(collectDanglingLinks([row.link], row.trackedPaths)).toStrictEqual([
    { ...row.link, resolved: row.resolved },
  ]);
});
