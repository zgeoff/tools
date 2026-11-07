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
    condition: 'its target folder ends in a slash',
    link: { path: '.claude/skills', target: '../.agents/skills/' },
    trackedPaths: ['.claude/skills', '.agents/skills/.gitkeep'],
  },
  {
    condition: 'its target is the repo root',
    link: { path: 'docs/root', target: '..' },
    trackedPaths: ['docs/root', 'package.json'],
  },
  {
    condition: 'its target is a tracked link',
    link: { path: 'hooks/start.ts', target: 'start-link.ts' },
    trackedPaths: ['hooks/start.ts', 'hooks/start-link.ts'],
  },
])('it passes a link when $condition', (row) => {
  expect(collectDanglingLinks([row.link], row.trackedPaths)).toStrictEqual([]);
});

test('it passes a slash-ended link whose target folder sits behind another tracked link', () => {
  const links = [
    { path: 'alias', target: 'real' },
    { path: 'outer', target: 'alias/' },
  ];

  expect(collectDanglingLinks(links, ['alias', 'outer', 'real/note.txt'])).toStrictEqual([]);
});

test('it reports each link of a chain that ends at a path a fresh clone lacks', () => {
  const links = [
    { path: 'outer', target: 'alias' },
    { path: 'alias', target: 'missing' },
  ];

  expect(collectDanglingLinks(links, ['outer', 'alias'])).toStrictEqual([
    { path: 'outer', target: 'alias', cause: { kind: 'missing', path: 'missing' } },
    { path: 'alias', target: 'missing', cause: { kind: 'missing', path: 'missing' } },
  ]);
});

test('it reports each link whose path steps out of a file with .. as needing a folder', () => {
  const links = [
    { path: 'outer', target: 'alias/child' },
    { path: 'alias', target: 'file/..' },
  ];

  expect(collectDanglingLinks(links, ['outer', 'alias', 'file', 'child'])).toStrictEqual([
    { path: 'outer', target: 'alias/child', cause: { kind: 'not-a-folder', path: 'file' } },
    { path: 'alias', target: 'file/..', cause: { kind: 'not-a-folder', path: 'file' } },
  ]);
});

test('it passes a chain of 40 links that ends at a tracked file', () => {
  const links = Array.from({ length: 40 }, (_, index) => ({
    path: `hop-${index}`,
    target: index === 39 ? 'end.txt' : `hop-${index + 1}`,
  }));

  expect(collectDanglingLinks(links, [...links.map((link) => link.path), 'end.txt'])).toStrictEqual(
    [],
  );
});

test('it reports the first link of a chain of 41 links as a loop, as Linux refuses it', () => {
  const links = Array.from({ length: 41 }, (_, index) => ({
    path: `hop-${index}`,
    target: index === 40 ? 'end.txt' : `hop-${index + 1}`,
  }));

  expect(collectDanglingLinks(links, [...links.map((link) => link.path), 'end.txt'])).toStrictEqual(
    [{ path: 'hop-0', target: 'hop-1', cause: { kind: 'loop' } }],
  );
});

test('it reports each link of a loop as a loop', () => {
  const links = [
    { path: 'ping', target: 'pong' },
    { path: 'pong', target: 'ping' },
  ];

  expect(collectDanglingLinks(links, ['ping', 'pong'])).toStrictEqual([
    { path: 'ping', target: 'pong', cause: { kind: 'loop' } },
    { path: 'pong', target: 'ping', cause: { kind: 'loop' } },
  ]);
});

test('it reports a link whose target sits behind a link to an absolute path as outside the repo', () => {
  const links = [
    { path: 'tools/node', target: 'bin/node' },
    { path: 'tools/bin', target: '/usr/bin' },
  ];

  expect(collectDanglingLinks(links, ['tools/node', 'tools/bin'])).toStrictEqual([
    { path: 'tools/node', target: 'bin/node', cause: { kind: 'outside-repo' } },
    { path: 'tools/bin', target: '/usr/bin', cause: { kind: 'outside-repo' } },
  ]);
});

test.each([
  {
    condition: 'no tracked file sits in its target folder',
    link: { path: '.claude/skills', target: '../.agents/skills' },
    trackedPaths: ['.claude/skills', '.claude/settings.json'],
    cause: { kind: 'missing', path: '.agents/skills' },
  },
  {
    condition: 'only a path that shares its name prefix is tracked',
    link: { path: 'docs/guide', target: 'guides' },
    trackedPaths: ['docs/guide', 'docs/guides-old/intro.md'],
    cause: { kind: 'missing', path: 'docs/guides' },
  },
  {
    condition: 'a folder on the way to its target is missing',
    link: { path: 'docs/guide', target: 'guides/intro.md' },
    trackedPaths: ['docs/guide', 'docs/readme.md'],
    cause: { kind: 'missing', path: 'docs/guides/intro.md' },
  },
  {
    condition: 'its target steps back with .. out of a missing folder',
    link: { path: 'docs/guide', target: 'drafts/../intro.md' },
    trackedPaths: ['docs/guide', 'docs/intro.md'],
    cause: { kind: 'missing', path: 'docs/drafts' },
  },
  {
    condition: 'its target leaves the repo',
    link: { path: 'vendor/lib', target: '../../shared/lib' },
    trackedPaths: ['vendor/lib', 'shared/lib/index.ts'],
    cause: { kind: 'outside-repo' },
  },
  {
    condition: 'its target ends in a slash but names a tracked file',
    link: { path: 'docs/notes', target: 'notes.md/' },
    trackedPaths: ['docs/notes', 'docs/notes.md'],
    cause: { kind: 'not-a-folder', path: 'docs/notes.md' },
  },
  {
    condition: 'its target is absolute',
    link: { path: 'bin/node', target: '/usr/bin/node' },
    trackedPaths: ['bin/node'],
    cause: { kind: 'outside-repo' },
  },
])('it reports a link when $condition', (row) => {
  expect(collectDanglingLinks([row.link], row.trackedPaths)).toStrictEqual([
    { ...row.link, cause: row.cause },
  ]);
});
