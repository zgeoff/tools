import { expect, test } from 'bun:test';
import { parseAuditAdvisories } from './parse-audit-advisories.ts';

test('it lists each advisory under both of its IDs', () => {
  const output = JSON.stringify({
    'left-pad': [
      {
        id: 1_100_200,
        url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
        title: 'Unbounded padding',
        severity: 'high',
        vulnerable_versions: '<1.3.1',
      },
    ],
  });

  expect(parseAuditAdvisories(output)).toStrictEqual([
    { advisoryIDs: ['1100200', 'GHSA-aaaa-bbbb-cccc'], packageName: 'left-pad' },
  ]);
});

test('it reads an empty report as no advisories', () => {
  expect(parseAuditAdvisories('{}')).toStrictEqual([]);
});

test('it rejects an advisory with no ID', () => {
  const output = JSON.stringify({
    'left-pad': [{ url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' }],
  });

  expect(() => parseAuditAdvisories(output)).toThrowWithMessage(
    TypeError,
    'bun audit --json has an advisory with no id or url for left-pad',
  );
});

test('it rejects a report whose package holds no advisory list', () => {
  const output = JSON.stringify({ 'left-pad': { id: 1_100_200 } });

  expect(() => parseAuditAdvisories(output)).toThrowWithMessage(
    TypeError,
    'bun audit --json lists no advisories for left-pad',
  );
});

test('it rejects output that holds no object', () => {
  expect(() => parseAuditAdvisories('[]')).toThrowWithMessage(
    TypeError,
    'bun audit --json printed no object',
  );
});
