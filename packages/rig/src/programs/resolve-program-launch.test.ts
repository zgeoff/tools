import { expect, test } from 'bun:test';
import { defineRig } from '../define-rig.ts';
import { resolveProgramLaunch } from './resolve-program-launch.ts';

function setupTest(environment: Readonly<Record<string, string | undefined>>) {
  const config = defineRig({
    programs: {
      'kettle-cli': {
        package: 'packages/kettle',
        source: 'src/cli.ts',
        build: 'true',
        artifact: 'dist/cli.js',
      },
    },
  });

  return {
    sources: {
      environment,
      cwd: '/repo/packages/kettle',
      importModule: () => Promise.resolve({ default: config }),
      probeFile: (path: string) => path === '/repo/rig.config.ts',
    },
  };
}

test.each([
  ['/repo/packages/kettle/dist/cli.js', ['bun', '/repo/packages/kettle/dist/cli.js']],
  ['/repo/packages/kettle/dist/cli.ts', ['bun', '/repo/packages/kettle/dist/cli.ts']],
  ['/repo/packages/kettle/dist/kettle', ['/repo/packages/kettle/dist/kettle']],
])('it runs the artifact %s', async (artifact, command) => {
  const ctx = setupTest({ RIG_PROGRAM_KETTLE_CLI: artifact });

  const launch = await resolveProgramLaunch('kettle-cli', ctx.sources);

  expect(launch.command).toStrictEqual(command);
});

test('it runs the artifact even in CI', async () => {
  const ctx = setupTest({ CI: 'true', RIG_PROGRAM_KETTLE_CLI: '/built/cli.js' });

  const launch = await resolveProgramLaunch('kettle-cli', ctx.sources);

  expect(launch.command).toStrictEqual(['bun', '/built/cli.js']);
});

test('it throws in CI when the program is not built', () => {
  const ctx = setupTest({ CI: 'true' });

  expect(resolveProgramLaunch('kettle-cli', ctx.sources)).rejects.toThrow(
    "program kettle-cli isn't built: run the e2e lane with rig e2e",
  );
});

test('it runs the source from the repo root when the artifact is unset and CI is unset', async () => {
  const ctx = setupTest({});

  const launch = await resolveProgramLaunch('kettle-cli', ctx.sources);

  expect(launch).toStrictEqual({
    command: ['bun', '/repo/packages/kettle/src/cli.ts'],
    cwd: '/repo',
  });
});

test('it runs the source when CI is empty', async () => {
  const ctx = setupTest({ CI: '' });

  const launch = await resolveProgramLaunch('kettle-cli', ctx.sources);

  expect(launch.cwd).toBe('/repo');
});

test('it throws when the config declares no such program', () => {
  const ctx = setupTest({});

  expect(resolveProgramLaunch('teapot', ctx.sources)).rejects.toThrow(
    "program teapot isn't declared: add it to rig.config.ts programs",
  );
});
