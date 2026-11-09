import { expect, test } from 'bun:test';
import { parseFixPlan } from './parse-fix-plan.ts';

test('it keeps the fixes, blocked packages and unfixable packages', () => {
  const plan = parseFixPlan({
    dryRun: false,
    fixes: [
      {
        name: 'brace-expansion',
        from: '5.0.6',
        to: '5.0.12',
        downgrade: false,
        newerThanMinimumReleaseAge: false,
        packageJson: [],
      },
    ],
    blocked: [
      {
        name: 'tinypool',
        from: '2.1.0',
        to: '2.1.2',
        blockers: [{ dependent: 'oxfmt@0.56.0', range: '2.1.0', bundled: false, override: null }],
      },
    ],
    unfixable: [{ name: 'left-pad', from: '1.0.0', advisories: ['GHSA-aaaa-bbbb-cccc'] }],
  });

  expect(plan).toStrictEqual({
    fixes: [
      { name: 'brace-expansion', from: '5.0.6', to: '5.0.12', newerThanMinimumReleaseAge: false },
    ],
    blocked: [
      {
        name: 'tinypool',
        from: '2.1.0',
        to: '2.1.2',
        blockers: [{ dependent: 'oxfmt@0.56.0', range: '2.1.0' }],
      },
    ],
    unfixable: [{ name: 'left-pad' }],
  });
});

test('it rejects a plan with no fixes list', () => {
  expect(() => parseFixPlan({ blocked: [], unfixable: [] })).toThrow(
    'bun audit fix --json has no fixes list',
  );
});
