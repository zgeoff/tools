import { expect, test } from 'bun:test';
import { collectTestPreloads } from './collect-test-preloads.ts';

test('it resolves a relative preload against the folder of its bunfig.toml', () => {
  const result = collectTestPreloads([
    {
      path: 'packages/kettle/bunfig.toml',
      text: '[test]\npreload = ["./setup.ts", "../shared/preload.ts", "@acme/extended"]\n',
    },
    { path: 'bunfig.toml', text: '[test]\npreload = "./root-setup.ts"\n' },
  ]);

  expect(result).toStrictEqual({
    preloads: ['packages/kettle/setup.ts', 'packages/shared/preload.ts', 'root-setup.ts'],
    faults: [],
  });
});

test('it reads no preload from a bunfig.toml without the list', () => {
  expect(
    collectTestPreloads([{ path: 'bunfig.toml', text: '[install]\nexact = true\n' }]),
  ).toStrictEqual({
    preloads: [],
    faults: [],
  });
});

test('it reports a bunfig.toml that does not parse', () => {
  const result = collectTestPreloads([{ path: 'packages/kettle/bunfig.toml', text: '[test\n' }]);

  expect(result.preloads).toStrictEqual([]);
  expect(result.faults).toHaveLength(1);
  expect(result.faults[0]).toStartWith('packages/kettle/bunfig.toml does not parse');
});
