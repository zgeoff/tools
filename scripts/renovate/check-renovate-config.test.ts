import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseRenovateVersion } from './check-renovate-config.ts';

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

  expect(parseRenovateVersion(workflow)).toBe('44.1.0');
});

test('it refuses a renovate job that pins no renovate-version', () => {
  const workflow = 'jobs:\n  renovate:\n    steps:\n      - uses: renovatebot/github-action@def\n';

  expect(() => parseRenovateVersion(workflow)).toThrow(
    'the renovate job holds 0 renovate-version inputs; the check reads exactly one',
  );
});

test('it reads the version that renovate.yml pins for the scheduled run', async () => {
  const text = await readFile(
    join(import.meta.dir, '../../.github/workflows/renovate.yml'),
    'utf8',
  );

  expect(parseRenovateVersion(text)).toMatch(/^\d+\.\d+\.\d+$/u);
});
