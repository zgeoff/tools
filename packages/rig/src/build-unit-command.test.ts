import { expect, test } from 'bun:test';
import { buildUnitCommand } from './build-unit-command.ts';
import { defineRig } from './define-rig.ts';

test('it runs the unit tests in random order with the worker count and leaves every lane out', () => {
  const command = buildUnitCommand(defineRig({}), 3, []);

  expect(command).toStrictEqual([
    'bun',
    'test',
    '--parallel=3',
    '--randomize',
    '--path-ignore-patterns=**/*.browser.test.ts',
    '--path-ignore-patterns=**/*.browser.test.tsx',
    '--path-ignore-patterns=**/*.docker.test.ts',
    '--path-ignore-patterns=**/*.docker.test.tsx',
    '--path-ignore-patterns=**/*.host.test.ts',
    '--path-ignore-patterns=**/*.host.test.tsx',
    '--path-ignore-patterns=**/*.agent-sdk.test.ts',
    '--path-ignore-patterns=**/*.agent-sdk.test.tsx',
    '--path-ignore-patterns=**/*.model-api.test.ts',
    '--path-ignore-patterns=**/*.model-api.test.tsx',
    '--path-ignore-patterns=**/e2e/**',
    '--path-ignore-patterns=**/*-e2e/**',
  ]);
});

test('it leaves out the files of a lane that the config declares', () => {
  const config = defineRig({
    lanes: { kiln: { limit: '15s' }, oven: { limit: '9s', suffix: '.bake' } },
  });

  const command = buildUnitCommand(config, 1, []);

  expect(command).toIncludeAllMembers([
    '--path-ignore-patterns=**/*.kiln.test.ts',
    '--path-ignore-patterns=**/*.kiln.test.tsx',
    '--path-ignore-patterns=**/*.bake.test.ts',
    '--path-ignore-patterns=**/*.bake.test.tsx',
  ]);
});

test('it ends with the arguments the caller passes', () => {
  const command = buildUnitCommand(defineRig({}), 2, ['--timeout=15000', './src/a.test.ts']);

  expect(command.slice(-2)).toStrictEqual(['--timeout=15000', './src/a.test.ts']);
});
