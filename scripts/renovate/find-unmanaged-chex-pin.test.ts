import { expect, test } from 'bun:test';
import { findUnmanagedChexPin } from './find-unmanaged-chex-pin.ts';

test('it finds no fault when a regex manager of the workflow captures the chex pin', () => {
  const renovateText = JSON.stringify({
    customManagers: [
      {
        customType: 'regex',
        managerFilePatterns: [String.raw`/^\.github/workflows/bun-checks\.yml$/`],
        matchStrings: ["CHEX: '(?<depName>@zgeoff/chex)@(?<currentValue>[^']+)'"],
      },
    ],
  });

  expect(
    findUnmanagedChexPin(renovateText, "env:\n  CHEX: '@zgeoff/chex@0.3.1'\n"),
  ).toBeUndefined();
});

test('it finds no fault when a glob file pattern names the workflow', () => {
  const renovateText = JSON.stringify({
    customManagers: [
      {
        customType: 'regex',
        managerFilePatterns: ['.github/workflows/*.yml'],
        matchStrings: ["CHEX: '(?<depName>@zgeoff/chex)@(?<currentValue>[^']+)'"],
      },
    ],
  });

  expect(
    findUnmanagedChexPin(renovateText, "env:\n  CHEX: '@zgeoff/chex@0.3.1'\n"),
  ).toBeUndefined();
});

test.each([
  ['no custom manager', {}],
  [
    'a manager of another file',
    {
      customManagers: [
        {
          customType: 'regex',
          managerFilePatterns: [String.raw`/^\.github/workflows/release-please\.yml$/`],
          matchStrings: ["CHEX: '(?<depName>@zgeoff/chex)@(?<currentValue>[^']+)'"],
        },
      ],
    },
  ],
  [
    'a pattern that misses the pin line',
    {
      customManagers: [
        {
          customType: 'regex',
          managerFilePatterns: [String.raw`/^\.github/workflows/bun-checks\.yml$/`],
          matchStrings: [String.raw`CHEX_VERSION: (?<currentValue>\S+)`],
        },
      ],
    },
  ],
  [
    'a pattern that captures another package',
    {
      customManagers: [
        {
          customType: 'regex',
          managerFilePatterns: [String.raw`/^\.github/workflows/bun-checks\.yml$/`],
          matchStrings: [String.raw`RIG: '(?<depName>@zgeoff/\w+)@(?<currentValue>[^']+)'`],
        },
      ],
    },
  ],
])('it reports the pin as unmanaged for %s', (_, config) => {
  const workflowText = "env:\n  CHEX: '@zgeoff/chex@0.3.1'\n  RIG: '@zgeoff/rig@1.0.0'\n";

  expect(findUnmanagedChexPin(JSON.stringify(config), workflowText)).toBe(
    'renovate.json: no custom manager captures the @zgeoff/chex pin in .github/workflows/bun-checks.yml, so Renovate never bumps it',
  );
});

test('it reports a renovate.json that is not JSON', () => {
  expect(findUnmanagedChexPin('{ "customManagers": [', "CHEX: '@zgeoff/chex@0.3.1'\n")).toBe(
    'renovate.json is not valid JSON',
  );
});
