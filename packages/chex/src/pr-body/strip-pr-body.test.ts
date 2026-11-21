import { expect, test } from 'bun:test';
import { stripPrBody } from './strip-pr-body.ts';

test('it removes a comment that spans lines and holds a heading and a code fence', () => {
  const body = '## Description\n\n<!--\n## Summary\n```ts\nconst x = 1;\n-->\nAn intro.\n';

  expect(stripPrBody(body).text).toBe('## Description\n\n\nAn intro.\n');
});

test('it removes the verify report and notes that the body has one', () => {
  const body = '## Verification\n\n<!-- wringer:report -->\n| a | b |\n<!-- /wringer:report -->\n';

  expect(stripPrBody(body)).toStrictEqual({ text: '## Verification\n\n\n', hasReport: true });
});

test('it notes no report when the closing marker is missing', () => {
  expect(stripPrBody('<!-- wringer:report -->\nrows\n').hasReport).toBe(false);
});
