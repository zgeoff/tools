import { expect, test } from 'bun:test';
import { parseRenovateVersion } from './parse-renovate-version.ts';

test('it reads the renovate-version input of the renovate job', () => {
  const workflow = [
    'jobs:',
    '  renovate:',
    '    steps:',
    '      - uses: actions/create-github-app-token@abc',
    '        with:',
    '          owner: acme',
    '      - uses: renovatebot/github-action@def',
    '        with:',
    '          renovate-version: 44.1.0',
    '',
  ].join('\n');

  expect(parseRenovateVersion(workflow)).toStrictEqual({ kind: 'parsed', version: '44.1.0' });
});

test('it refuses a renovate job that pins no renovate-version', () => {
  const workflow = 'jobs:\n  renovate:\n    steps:\n      - uses: renovatebot/github-action@def\n';

  expect(parseRenovateVersion(workflow)).toStrictEqual({
    kind: 'invalid',
    message: 'the renovate job holds 0 renovate-version inputs; the check reads exactly one',
  });
});

test('it refuses a renovate job that pins several renovate-version inputs', () => {
  const workflow = [
    'jobs:',
    '  renovate:',
    '    steps:',
    '      - with:',
    '          renovate-version: 44.1.0',
    '      - with:',
    '          renovate-version: 44.2.0',
    '',
  ].join('\n');

  expect(parseRenovateVersion(workflow)).toStrictEqual({
    kind: 'invalid',
    message: 'the renovate job holds 2 renovate-version inputs; the check reads exactly one',
  });
});

test('it refuses a renovate-version that names no exact release', () => {
  const workflow =
    'jobs:\n  renovate:\n    steps:\n      - with:\n          renovate-version: latest\n';

  expect(parseRenovateVersion(workflow)).toStrictEqual({
    kind: 'invalid',
    message: "the renovate-version input is 'latest', not an exact release such as 44.1.0",
  });
});
