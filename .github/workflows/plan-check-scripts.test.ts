import { expect, test } from 'bun:test';
import { planCheckScripts } from './plan-check-scripts.ts';

test('it leaves check out of the standard list when the repo defines the script', () => {
  const plan = planCheckScripts({
    scripts: '  ',
    defined: ['audit', 'check', 'deadcode', 'format:check', 'lint', 'test', 'typecheck'],
    part: 'all',
    lane: '',
  });

  expect(plan).toStrictEqual({
    kind: 'planned',
    scripts: ['audit', 'deadcode', 'format:check', 'lint', 'typecheck', 'test'],
    static: ['audit', 'deadcode', 'format:check', 'lint', 'typecheck'],
    test: ['test'],
    lanes: [],
  });
});

test('it adds each lane script the repo defines to the standard list', () => {
  const plan = planCheckScripts({
    scripts: '',
    defined: [
      'audit',
      'deadcode',
      'format:check',
      'lint',
      'test',
      'test:host',
      'test:browser',
      'typecheck',
    ],
    part: 'all',
    lane: '',
  });

  expect(plan).toStrictEqual({
    kind: 'planned',
    scripts: [
      'audit',
      'deadcode',
      'format:check',
      'lint',
      'typecheck',
      'test',
      'test:browser',
      'test:host',
    ],
    static: ['audit', 'deadcode', 'format:check', 'lint', 'typecheck'],
    test: ['test'],
    lanes: ['browser', 'host'],
  });
});

test('it sorts the listed scripts into static checks, tests and lanes', () => {
  const plan = planCheckScripts({
    scripts: 'lint test:e2e test test:slow check',
    defined: ['check', 'lint', 'test', 'test:e2e', 'test:slow'],
    part: 'all',
    lane: '',
  });

  expect(plan).toStrictEqual({
    kind: 'planned',
    scripts: ['lint', 'check', 'test', 'test:slow', 'test:e2e'],
    static: ['lint', 'check'],
    test: ['test', 'test:slow'],
    lanes: ['e2e'],
  });
});

test('it reports each listed script the repo does not define', () => {
  const plan = planCheckScripts({
    scripts: 'lint check test:e2e',
    defined: ['lint'],
    part: 'all',
    lane: '',
  });

  expect(plan).toStrictEqual({ kind: 'missing', missing: ['check', 'test:e2e'] });
});

test.each([
  ['static', '', ['lint', 'check']],
  ['test', '', ['test', 'test:slow']],
  ['lane', 'e2e', ['test:e2e']],
] as const)('it gives a public %s job only its own scripts', (part, lane, expected) => {
  const plan = planCheckScripts({
    scripts: 'lint test:e2e test test:slow check',
    defined: ['check', 'lint', 'test', 'test:e2e', 'test:slow'],
    part,
    lane,
  });

  expect(plan).toMatchObject({ kind: 'planned', scripts: expected });
});
