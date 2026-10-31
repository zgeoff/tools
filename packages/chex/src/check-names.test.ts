import { expect, test } from 'bun:test';
import { isCheckName } from './check-names.ts';

test('it reads each docs check and each repo check as a check name', () => {
  expect(
    [
      'prose',
      'length',
      'links',
      'readmes',
      'vision',
      'skill',
      'commits',
      'local-paths',
      'test-timeouts',
      'workflows',
      'dependency-gates',
      'uncommitted',
    ].filter((name) => !isCheckName(name)),
  ).toStrictEqual([]);
});

test('it reads init, a path and an empty string as no check name', () => {
  expect(
    ['init', 'docs/guide.md', '', 'Length'].filter((value) => isCheckName(value)),
  ).toStrictEqual([]);
});
