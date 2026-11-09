import { expect, test } from 'bun:test';
import { pickVerdictStop } from './pick-verdict-stop.ts';

test('it lets the sync go on for a current commit', () => {
  expect(pickVerdictStop({ kind: 'current' }, 'c0ffee')).toBeNull();
});

test('it fails the run with the message for a refused commit', () => {
  const stop = pickVerdictStop({ kind: 'refused', message: 'not on main' }, 'c0ffee');

  expect(stop).toStrictEqual({ exitCode: 1, line: '::error::not on main\n' });
});

test('it ends the run cleanly and names the newer pin for a superseded commit', () => {
  const stop = pickVerdictStop(
    { kind: 'superseded', holder: 'Pull request #7', pin: 'beefcafe' },
    'c0ffee',
  );

  expect(stop).toStrictEqual({
    exitCode: 0,
    line: 'Pull request #7 already pins beefcafe, which is newer than c0ffee; nothing to do.\n',
  });
});
