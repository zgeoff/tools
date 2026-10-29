import { expect, test } from 'bun:test';
import { collectUndeliveredPaths } from './collect-undelivered-paths.ts';

test('it returns no path when the branch changes only delivered targets and removed copies', () => {
  const undelivered = collectUndeliveredPaths({
    changed: ['.editorconfig', '.claude/skills/demo/SKILL.md', 'docs/old.md'],
    delivered: ['.editorconfig', '.claude/skills/demo/SKILL.md', 'docs/old.md', 'socket.yml'],
    scripts: {},
    packageJSON: null,
  });

  expect(undelivered).toStrictEqual([]);
});

test('it returns each changed path the run neither copied nor removed', () => {
  const undelivered = collectUndeliveredPaths({
    changed: ['.editorconfig', 'src/server.ts', 'package.json.tmp'],
    delivered: ['.editorconfig'],
    scripts: {},
    packageJSON: null,
  });

  expect(undelivered).toStrictEqual(['src/server.ts', 'package.json.tmp']);
});

test('it counts a package.json change that only sets the declared scripts as delivered', () => {
  const undelivered = collectUndeliveredPaths({
    changed: ['package.json'],
    delivered: [],
    scripts: { 'check:demo': 'bun scripts/check-demo.ts', 'lint:demo': 'oxlint' },
    packageJSON: {
      before: JSON.stringify({
        name: 'app',
        scripts: { test: 'bun test', 'lint:demo': 'oxlint --old' },
      }),
      after: `${JSON.stringify(
        {
          name: 'app',
          scripts: {
            test: 'bun test',
            'lint:demo': 'oxlint --old',
            'check:demo': 'bun scripts/check-demo.ts',
          },
        },
        null,
        2,
      )}\n`,
    },
  });

  expect(undelivered).toStrictEqual([]);
});

test('it counts a package.json that gains a scripts object holding only declared scripts as delivered', () => {
  const undelivered = collectUndeliveredPaths({
    changed: ['package.json'],
    delivered: [],
    scripts: { 'check:demo': 'bun scripts/check-demo.ts' },
    packageJSON: {
      before: JSON.stringify({ name: 'app' }),
      after: JSON.stringify({
        name: 'app',
        scripts: { 'check:demo': 'bun scripts/check-demo.ts' },
      }),
    },
  });

  expect(undelivered).toStrictEqual([]);
});

test.each([
  [
    'a script the manifest does not declare',
    JSON.stringify({ name: 'app', scripts: { postinstall: 'curl example.com' } }),
  ],
  [
    'a declared script set to another value',
    JSON.stringify({ name: 'app', scripts: { 'check:demo': 'bun scripts/other.ts' } }),
  ],
  [
    'a field outside the scripts',
    JSON.stringify({ name: 'app', dependencies: { 'left-pad': '1.3.0' } }),
  ],
  ['text that is no JSON', '{ "name": "app",'],
])('it returns package.json when the change holds %s', (_label, after) => {
  const undelivered = collectUndeliveredPaths({
    changed: ['package.json'],
    delivered: [],
    scripts: { 'check:demo': 'bun scripts/check-demo.ts' },
    packageJSON: { before: JSON.stringify({ name: 'app' }), after },
  });

  expect(undelivered).toStrictEqual(['package.json']);
});

test('it returns package.json when the branch changes it and a side lacks the file', () => {
  const undelivered = collectUndeliveredPaths({
    changed: ['package.json'],
    delivered: [],
    scripts: { 'check:demo': 'bun scripts/check-demo.ts' },
    packageJSON: null,
  });

  expect(undelivered).toStrictEqual(['package.json']);
});
