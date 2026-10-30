import { expect, test } from 'bun:test';
import { hasErrorCode } from './has-error-code.ts';

test('it finds the code on an error that holds it, and on no other value', () => {
  const missing = Object.assign(new Error('no such folder'), { code: 'ENOENT' });

  expect(hasErrorCode(missing, 'ENOENT')).toBeTrue();
  expect(hasErrorCode(missing, 'EPERM')).toBeFalse();
  expect(hasErrorCode(new Error('no code'), 'ENOENT')).toBeFalse();
  expect(hasErrorCode({ code: 'ENOENT' }, 'ENOENT')).toBeFalse();
});
