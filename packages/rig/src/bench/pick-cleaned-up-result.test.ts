import { expect, test } from 'bun:test';
import type { CleanedUpResult } from './pick-cleaned-up-result.ts';
import { pickCleanedUpResult } from './pick-cleaned-up-result.ts';

test.each<
  readonly [
    string,
    PromiseSettledResult<number>,
    PromiseSettledResult<string>,
    CleanedUpResult<number, string>,
  ]
>([
  [
    'gives the run value and the cleanup value when both finished',
    { status: 'fulfilled', value: 3 },
    { status: 'fulfilled', value: 'swept' },
    { kind: 'fulfilled', value: 3, cleanup: 'swept' },
  ],
  [
    'hands on the error of a run that threw when its cleanup finished',
    { status: 'rejected', reason: 'the kiln cracked' },
    { status: 'fulfilled', value: 'swept' },
    { kind: 'throw', error: 'the kiln cracked' },
  ],
  [
    'hands on the error of a cleanup that threw after a run that finished',
    { status: 'fulfilled', value: 0 },
    { status: 'rejected', reason: 'the shelf collapsed' },
    { kind: 'throw', error: 'the shelf collapsed' },
  ],
])('it %s', (_title, ran, cleaned, expected) => {
  expect(pickCleanedUpResult(ran, cleaned)).toStrictEqual(expected);
});

test('it throws both errors, the run error first, when the run and its cleanup both threw', () => {
  const result = pickCleanedUpResult(
    { status: 'rejected', reason: 'the kiln cracked' },
    { status: 'rejected', reason: 'the shelf collapsed' },
  );

  expect(result).toStrictEqual({
    kind: 'throw',
    error: expect.objectContaining({
      constructor: AggregateError,
      message: 'the run failed, and its cleanup failed too',
      errors: ['the kiln cracked', 'the shelf collapsed'],
    }),
  });
});
