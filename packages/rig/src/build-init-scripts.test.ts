import { expect, test } from 'bun:test';
import { buildInitScripts } from './build-init-scripts.ts';
import { defineRig } from './define-rig.ts';

test('it writes the test and related scripts and keeps the scripts it does not own', () => {
  const scripts = buildInitScripts({ lint: 'oxlint', test: 'bun test' }, defineRig({}), []);

  expect(scripts).toStrictEqual({
    lint: 'oxlint',
    test: 'rig unit',
    'test:related': 'rig related',
  });
});

test('it adds a script for a built-in lane that has a tracked test file', () => {
  const files = ['src/view.browser.test.tsx', 'src/clock.host.test.ts', 'src/a.test.ts'];
  const scripts = buildInitScripts({}, defineRig({}), files);

  expect(Object.keys(scripts)).toStrictEqual(['test', 'test:related', 'test:browser', 'test:host']);
  expect(scripts['test:browser']).toBe('rig browser');
  expect(scripts['test:host']).toBe('rig host');
});

test('it adds the e2e script when git tracks an e2e folder', () => {
  const scripts = buildInitScripts({}, defineRig({}), ['e2e/login.test.ts']);

  expect(scripts['test:e2e']).toBe('rig e2e');
});

test('it adds a script for a lane the config declares, even with no test file yet', () => {
  const config = defineRig({ lanes: { kiln: { limit: '15s' } } });
  const scripts = buildInitScripts({}, config, []);

  expect(scripts['test:kiln']).toBe('rig kiln');
});

test('it replaces a lane script that runs something else', () => {
  const scripts = buildInitScripts({ 'test:host': 'bun test .host.test.ts' }, defineRig({}), [
    'src/clock.host.test.ts',
  ]);

  expect(scripts['test:host']).toBe('rig host');
});
