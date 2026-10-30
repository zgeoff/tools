import { expect, test } from 'bun:test';
import preset from '../../../default.json' with { type: 'json' };
import { firstPartyScopes } from './first-party-scopes.ts';

test('it names the scopes that the Renovate preset bumps as soon as they publish', () => {
  const firstPartyRule = preset.packageRules.find(
    (rule) => rule.matchPackageNames?.includes('@zgeoff/**') === true,
  );

  expect(firstPartyRule?.matchPackageNames).toStrictEqual(
    firstPartyScopes.map((scope) => `${scope}**`),
  );
});
