import { expect, test } from 'bun:test';
import { parsePushedRefs } from './parse-pushed-refs.ts';

test('it parses the local and remote commit of a ref that the push updates', () => {
  const refs = parsePushedRefs(
    'refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 2222222222222222222222222222222222222222\n',
  );

  expect(refs).toStrictEqual([
    {
      localSha: '1111111111111111111111111111111111111111',
      remoteSha: '2222222222222222222222222222222222222222',
    },
  ]);
});

test('it parses a null remote commit for a ref that the push creates', () => {
  const refs = parsePushedRefs(
    `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000\n`,
  );

  expect(refs).toStrictEqual([
    { localSha: '1111111111111111111111111111111111111111', remoteSha: null },
  ]);
});

test('it leaves out a ref that the push deletes', () => {
  const refs = parsePushedRefs(
    [
      `(delete) 0000000000000000000000000000000000000000 refs/heads/farewell 3333333333333333333333333333333333333333`,
      `refs/heads/greeting 1111111111111111111111111111111111111111 refs/heads/greeting 0000000000000000000000000000000000000000`,
      '',
    ].join('\n'),
  );

  expect(refs).toStrictEqual([
    { localSha: '1111111111111111111111111111111111111111', remoteSha: null },
  ]);
});

test('it throws on a line that holds fewer than four fields', () => {
  expect(() =>
    parsePushedRefs('refs/heads/greeting 1111111111111111111111111111111111111111\n'),
  ).toThrow(
    'cannot read the pushed ref line: refs/heads/greeting 1111111111111111111111111111111111111111',
  );
});
