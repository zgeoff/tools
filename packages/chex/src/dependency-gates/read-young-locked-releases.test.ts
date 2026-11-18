import { expect, test } from 'bun:test';
import { server } from '@zgeoff/tools-scripts/test-utils/mocks/node';
import { HttpResponse, http } from 'msw';
import type { LockfileRegistryPackage } from './parse-lockfile-registry-names.ts';
import { readYoungLockedReleases } from './read-young-locked-releases.ts';

interface TestSetup {
  readonly times: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly packages: readonly LockfileRegistryPackage[];
  readonly excludes?: readonly string[];
  readonly gateSeconds?: number;
}

function setupTest(options: Readonly<TestSetup>) {
  const requested: string[] = [];

  // The registry answers a package URL with a packument that holds its publish times, and a 404
  // for a package it holds none of.
  server.use(
    http.get('https://registry.npmjs.org/*', (info) => {
      requested.push(info.request.url);

      const name = decodeURIComponent(new URL(info.request.url).pathname.slice(1));
      const time = options.times[name];

      return time === undefined
        ? HttpResponse.json({ error: 'Not found' }, { status: 404 })
        : HttpResponse.json({ name, time });
    }),
  );

  const seconds = options.gateSeconds ?? 604_800;

  return {
    requested,
    read: () =>
      readYoungLockedReleases({
        ageGate: { isOn: seconds > 0, seconds, excludes: options.excludes ?? [] },
        packages: options.packages,
        nowMs: Date.parse('2026-03-09T12:00:00Z'),
      }),
  };
}

test('it fails a young pinned release that no exclude covers, and names its package, version and time', async () => {
  const setup = setupTest({
    times: { 'left-pad': { '1.3.1': '2026-03-08T20:00:00.000Z' } },
    packages: [{ name: 'left-pad', version: '1.3.1' }],
  });

  const findings = await setup.read();

  expect(findings).toStrictEqual([
    {
      path: 'bun.lock',
      entry: 'left-pad@1.3.1',
      problem:
        'bun.lock pins a release published 2026-03-08T20:00:00.000Z, younger than the 604800 second minimumReleaseAge, and no age-gate exclude covers it',
    },
  ]);
});

test.each([['left-pad'], ['left-pad@1.3.1']])(
  'it clears a young pinned release that the exclude %s covers',
  async (exclude) => {
    const setup = setupTest({
      times: { 'left-pad': { '1.3.1': '2026-03-08T20:00:00.000Z' } },
      packages: [{ name: 'left-pad', version: '1.3.1' }],
      excludes: [exclude],
    });

    const findings = await setup.read();

    expect(findings).toStrictEqual([]);
  },
);

test('it skips a first-party package without asking the registry', async () => {
  const setup = setupTest({ times: {}, packages: [{ name: '@zgeoff/std', version: '0.4.0' }] });

  const findings = await setup.read();

  expect(findings).toStrictEqual([]);
  expect(setup.requested).toStrictEqual([]);
});

test('it clears a release older than the gate', async () => {
  const setup = setupTest({
    times: { 'left-pad': { '1.3.0': '2026-02-01T00:00:00.000Z' } },
    packages: [{ name: 'left-pad', version: '1.3.0' }],
  });

  const findings = await setup.read();

  expect(findings).toStrictEqual([]);
});

test('it reports nothing, and asks nothing, when no gate is set', async () => {
  const setup = setupTest({
    times: {},
    packages: [{ name: 'left-pad', version: '1.3.1' }],
    gateSeconds: 0,
  });

  const findings = await setup.read();

  expect(findings).toStrictEqual([]);
  expect(setup.requested).toStrictEqual([]);
});

test('it asks once for a package that the lockfile pins at two versions, and encodes a scope', async () => {
  const setup = setupTest({
    times: {
      '@acme/pad': { '1.0.0': '2026-01-01T00:00:00.000Z', '2.0.0': '2026-01-02T00:00:00.000Z' },
    },
    packages: [
      { name: '@acme/pad', version: '1.0.0' },
      { name: '@acme/pad', version: '2.0.0' },
    ],
  });

  await setup.read();

  expect(setup.requested).toStrictEqual(['https://registry.npmjs.org/@acme%2fpad']);
});

test('it fails with the package and URL when the registry cannot be reached', () => {
  const setup = setupTest({ times: {}, packages: [{ name: 'left-pad', version: '1.3.1' }] });

  server.use(http.get('https://registry.npmjs.org/left-pad', () => HttpResponse.error()));

  expect(setup.read()).rejects.toThrow(
    'could not read the publish times of left-pad from https://registry.npmjs.org/left-pad:',
  );
});

test('it fails when the registry answers an error status', () => {
  const setup = setupTest({ times: {}, packages: [{ name: 'left-pad', version: '1.3.1' }] });

  expect(setup.read()).rejects.toThrowWithMessage(
    Error,
    'could not read the publish times of left-pad from https://registry.npmjs.org/left-pad: answered 404',
  );
});
