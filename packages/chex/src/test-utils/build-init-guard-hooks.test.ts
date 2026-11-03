import { expect, test } from 'bun:test';
import { buildLefthookGuard } from '../build-lefthook-guard.ts';
import { buildInitGuardHooks } from './build-init-guard-hooks.ts';

test('it holds the hooks that chex init adds to a lefthook.yml that has neither', () => {
  expect(buildLefthookGuard('extends: []\n')).toStrictEqual({
    kind: 'changed',
    text: `extends: []\n${buildInitGuardHooks()}`,
  });
});
