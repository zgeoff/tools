import { expect, test } from 'bun:test';
import { buildProgramEnvironment, buildProgramVariable } from './build-program-environment.ts';

test('it upper-cases a program name and turns its dashes into underscores', () => {
  expect(buildProgramVariable('kettle-cli')).toBe('RIG_PROGRAM_KETTLE_CLI');
});

test('it maps each program to the absolute path of its artifact', () => {
  const environment = buildProgramEnvironment('/repo', {
    'kettle-cli': {
      package: 'packages/kettle',
      source: 'src/cli.ts',
      build: 'true',
      artifact: 'dist/cli.js',
    },
  });

  expect(environment).toStrictEqual({
    RIG_PROGRAM_KETTLE_CLI: '/repo/packages/kettle/dist/cli.js',
  });
});
