import { expect, test } from 'bun:test';
import { pickConsentChoice } from './pick-consent-choice.ts';

test.each<[string, string[], string | null, ReturnType<typeof pickConsentChoice>]>([
  [
    'an approve with read ticked',
    ['read'],
    'approve',
    { accept: true, scopes: ['read'], scope: 'read offline_access', noneTicked: false },
  ],
  [
    'an approve with nothing ticked',
    [],
    'approve',
    { accept: false, scopes: [], scope: null, noneTicked: true },
  ],
  [
    'an approve with only a scope the server does not know',
    ['admin'],
    'approve',
    { accept: false, scopes: [], scope: null, noneTicked: true },
  ],
  [
    'an approve with a known and an unknown scope',
    ['admin', 'write'],
    'approve',
    { accept: true, scopes: ['write'], scope: 'write offline_access', noneTicked: false },
  ],
  [
    'an approve with offline_access ticked alone',
    ['offline_access'],
    'approve',
    { accept: false, scopes: [], scope: null, noneTicked: true },
  ],
  [
    'a deny with read ticked',
    ['read'],
    'deny',
    { accept: false, scopes: [], scope: null, noneTicked: false },
  ],
  [
    'a form with no decision',
    ['read'],
    null,
    { accept: false, scopes: [], scope: null, noneTicked: false },
  ],
  [
    'a decision in another case',
    ['read'],
    'Approve',
    { accept: false, scopes: [], scope: null, noneTicked: false },
  ],
])('it picks the consent choice of %s', (_title, ticked, decision, choice) => {
  expect(pickConsentChoice(['read', 'write'], ticked, decision)).toStrictEqual(choice);
});
