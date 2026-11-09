import { expect, test } from 'bun:test';
import { buildRelatedTestCommand } from './build-related-test-command.ts';

test('it returns the reason when the worker count is invalid', () => {
  expect(
    buildRelatedTestCommand(['src/a.test.ts'], {
      kind: 'invalid',
      message: 'TEST_WORKERS is four; set it to a whole number above 0',
    }),
  ).toStrictEqual({
    kind: 'invalid',
    message: 'TEST_WORKERS is four; set it to a whole number above 0',
  });
});

test('it runs the tests on 1 worker with --no-isolate and the slow-host timeout', () => {
  expect(
    buildRelatedTestCommand(['src/a.test.ts', 'src/b.test.ts'], { kind: 'count', count: 1 }),
  ).toStrictEqual({
    kind: 'run',
    command: [
      'bun',
      'run',
      'test',
      '--parallel=1',
      '--no-isolate',
      '--timeout=15000',
      './src/a.test.ts',
      './src/b.test.ts',
    ],
  });
});

test.each([[2], [4]])(
  'it runs the tests on %d workers with --no-isolate and no timeout',
  (count) => {
    expect(buildRelatedTestCommand(['src/a.test.ts'], { kind: 'count', count })).toStrictEqual({
      kind: 'run',
      command: ['bun', 'run', 'test', `--parallel=${count}`, '--no-isolate', './src/a.test.ts'],
    });
  },
);
