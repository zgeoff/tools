import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { firstPartyScopes } from '../packages/chex/src/dependency-gates/first-party-scopes.ts';

test('it names, in the ci-design skill, the scopes that the dependency gates check treats as first party', async () => {
  const skill = await Bun.file(join(import.meta.dir, '../sync/skills/ci-design/SKILL.md')).text();

  const sentence = /A first-party package is one under (?<scopes>[^.]*?), the scopes in/u.exec(
    skill.replaceAll(/\s+/gu, ' '),
  );

  const scopes = [...(sentence?.groups?.['scopes'] ?? '').matchAll(/`(?<scope>@[^`]+\/)`/gu)].map(
    (match) => match.groups?.['scope'],
  );

  expect(scopes).toIncludeSameMembers([...firstPartyScopes]);
});
