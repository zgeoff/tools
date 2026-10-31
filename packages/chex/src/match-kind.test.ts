import { expect, test } from 'bun:test';
import { matchKind } from './match-kind.ts';

type Pour = { readonly kind: 'hot'; readonly degrees: number } | { readonly kind: 'cold' };

test.each<[Pour, string]>([
  [{ kind: 'hot', degrees: 90 }, 'hot at 90'],
  [{ kind: 'cold' }, 'cold'],
])('it runs the branch of the value kind with the narrowed value', (pour, expected) => {
  const text = matchKind(pour, {
    hot: (hot) => `hot at ${hot.degrees}`,
    cold: () => 'cold',
  });

  expect(text).toBe(expected);
});

test.each<[Pour]>([[{ kind: 'cold' }]])(
  'it fails the type check, and throws, when a kind of the union has no branch',
  (pour) => {
    const handlers = { hot: () => 'hot' };

    // @ts-expect-error: the cold kind has no branch, which the handler type refuses.
    const runWithoutCold = () => matchKind(pour, handlers);

    expect(runWithoutCold).toThrow('no branch handles the kind cold');
  },
);
