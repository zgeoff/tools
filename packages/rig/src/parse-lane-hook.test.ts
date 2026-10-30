import { expect, test } from 'bun:test';
import { makeResolvingStub } from '../../../test-utils/make-resolving-stub.ts';
import { parseLaneHook } from './parse-lane-hook.ts';

test('it returns the default export of a hook module', () => {
  const hook = makeResolvingStub(undefined);

  expect(parseLaneHook({ default: hook }, 'test-utils/start-kiln.ts')).toBe(hook);
});

test.each([
  ['a module with no default export', {}],
  ['a default export that is no function', { default: 'start' }],
  ['no module', null],
])('it refuses %s', (_title, loaded) => {
  expect(() => parseLaneHook(loaded, 'test-utils/start-kiln.ts')).toThrow(
    'test-utils/start-kiln.ts must default-export a function',
  );
});
