import { expect, test } from 'bun:test';
import { parseLockfileRegistryNames } from './parse-lockfile-registry-names.ts';

test('it lists each registry package once, sorted, and leaves out workspace, file and git entries', () => {
  const lockfile = `{
    "lockfileVersion": 1,
    "workspaces": { "": { "name": "kettle" } },
    "packages": {
      "@zgeoff/std": ["@zgeoff/std@0.4.0", "", {}, "sha512-a"],
      "left-pad": ["left-pad@1.3.0", "", {}, "sha512-b"],
      "pad-tools/left-pad": ["left-pad@1.2.0", "", {}, "sha512-c"],
      "@zgeoff/chex": ["@zgeoff/chex@workspace:packages/chex"],
      "local-pad": ["local-pad@file:../local-pad", {}],
      "@zgeoff/vendored": ["@zgeoff/vendored@file:../vendor/@zgeoff/vendored", {}],
      "git-pad": ["git-pad@github:example/git-pad#1a2b3c4", {}, "1a2b3c4"],
    },
  }`;

  expect(parseLockfileRegistryNames(lockfile)).toStrictEqual(['@zgeoff/std', 'left-pad']);
});

test('it fails a lockfile with no packages object', () => {
  expect(() => parseLockfileRegistryNames('{ "lockfileVersion": 1 }')).toThrow(
    'bun.lock has no packages object',
  );
});

test('it fails a package entry with no id', () => {
  expect(() => parseLockfileRegistryNames('{ "packages": { "left-pad": [] } }')).toThrow(
    'bun.lock has a package entry that does not start with its id',
  );
});
