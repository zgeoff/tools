import { expect, test } from 'bun:test';
import { collectBashCandidates } from './collect-bash-candidates.ts';

test('it hashes every recorded and listed path, and marks the listed ones the record lacks as clean before', () => {
  expect(
    collectBashCandidates({ 'src/a.test.ts': 'a1', 'src/b.test.ts': null }, [
      'src/a.test.ts',
      'src/c.test.ts',
      'src/c.test.ts',
    ]),
  ).toStrictEqual({
    hashedPaths: ['src/a.test.ts', 'src/b.test.ts', 'src/c.test.ts'],
    cleanBefore: ['src/c.test.ts'],
  });
});
