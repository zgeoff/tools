import { expect, test } from 'bun:test';
import { defineRig } from './define-rig.ts';

test('it resolves the built-in lanes when nothing is declared', () => {
  const config = defineRig({});

  expect(config.lanes.map((lane) => lane.name)).toStrictEqual([
    'unit',
    'e2e',
    'browser',
    'docker',
    'host',
    'agent-sdk',
    'model-api',
  ]);

  expect(config.lanes.find((lane) => lane.name === 'browser')).toStrictEqual({
    name: 'browser',
    suffix: '.browser',
    limitMs: 10_000,
    parallel: 1,
    memory: null,
    start: null,
    stop: null,
  });
});

test('it gives a declared lane the default suffix and one process per file', () => {
  const config = defineRig({ lanes: { kiln: { limit: '15s' } } });

  expect(config.lanes.find((lane) => lane.name === 'kiln')).toStrictEqual({
    name: 'kiln',
    suffix: '.kiln',
    limitMs: 15_000,
    parallel: 1,
    memory: null,
    start: null,
    stop: null,
  });
});

test('it reads a millisecond limit, a suffix, a memory budget and hook paths on a declared lane', () => {
  const config = defineRig({
    lanes: {
      kiln: {
        suffix: '.oven',
        limit: '1500ms',
        memory: '8G',
        start: './test-utils/start-kiln.ts',
        stop: 'test-utils/stop-kiln.ts',
      },
    },
  });

  expect(config.lanes.find((lane) => lane.name === 'kiln')).toStrictEqual({
    name: 'kiln',
    suffix: '.oven',
    limitMs: 1500,
    parallel: 1,
    memory: '8G',
    start: './test-utils/start-kiln.ts',
    stop: 'test-utils/stop-kiln.ts',
  });
});

test('it lets a declaration override the limit, memory and hooks of a built-in lane', () => {
  const config = defineRig({
    lanes: { docker: { limit: '30s', memory: '2G', start: 'test-utils/start-docker.ts' } },
  });

  expect(config.lanes.find((lane) => lane.name === 'docker')).toStrictEqual({
    name: 'docker',
    suffix: '.docker',
    limitMs: 30_000,
    parallel: 1,
    memory: '2G',
    start: 'test-utils/start-docker.ts',
    stop: null,
  });
});

test('it lets the unit lane take a memory budget', () => {
  expect(
    defineRig({ lanes: { unit: { memory: '4G' } } }).lanes.find((lane) => lane.name === 'unit')
      ?.memory,
  ).toBe('4G');
});

test('it lets the e2e lane take a limit, a memory budget and hooks', () => {
  const config = defineRig({
    lanes: {
      e2e: {
        limit: '20s',
        memory: '2G',
        start: 'test-utils/pack.ts',
        stop: 'test-utils/unpack.ts',
      },
    },
  });

  expect(config.lanes.find((lane) => lane.name === 'e2e')).toStrictEqual({
    name: 'e2e',
    suffix: null,
    limitMs: 20_000,
    parallel: 1,
    memory: '2G',
    start: 'test-utils/pack.ts',
    stop: 'test-utils/unpack.ts',
  });
});

test.each([
  [{ kiln: {} }, 'lane "kiln" needs a limit'],
  [{ kiln: { limit: '15' } }, 'lane "kiln" has the limit "15"'],
  [{ docker: { limit: '0s' } }, 'lane "docker" has the limit "0s"'],
  [{ kiln: { limit: '15s', memory: '8GB' } }, 'lane "kiln" has the memory "8GB"'],
  [{ kiln: { limit: '15s', suffix: 'kiln' } }, 'lane "kiln" has the suffix "kiln"'],
  [{ kiln: { limit: '15s', start: '/abs/start.ts' } }, 'lane "kiln" has the start "/abs/start.ts"'],
  [{ kiln: { limit: '15s', stop: '' } }, 'lane "kiln" has the stop ""'],
  [{ Kiln: { limit: '15s' } }, 'the lane name "Kiln"'],
  [{ init: { limit: '15s' } }, 'the lane name "init" is a rig command'],
  [{ related: { limit: '15s' } }, 'the lane name "related" is a rig command'],
  [{ unit: { suffix: '.unit' } }, 'lane "unit" declares suffix'],
  [{ unit: { limit: '9s' } }, 'lane "unit" declares limit'],
  [{ unit: { start: 'start.ts' } }, 'lane "unit" declares start'],
  [{ unit: { stop: 'stop.ts' } }, 'lane "unit" declares stop'],
  [{ e2e: { suffix: '.e2e' } }, 'lane "e2e" declares suffix'],
  [{ browser: { start: 'start.ts' } }, 'lane "browser" declares a start or a stop'],
  [{ browser: { stop: 'stop.ts' } }, 'lane "browser" declares a start or a stop'],
  [{ kiln: { limit: '15s', suffix: '.docker' } }, 'both use the suffix ".docker"'],
  [
    { smoke: { limit: '60s', suffix: '.e2e' } },
    'lane "smoke" has the suffix ".e2e", which the e2e lane reserves',
  ],
  [
    { smoke: { limit: '60s', suffix: '.unit' } },
    'lane "smoke" has the suffix ".unit", which the unit lane reserves',
  ],
  [{ host: { suffix: '.e2e' } }, 'lane "host" has the suffix ".e2e", which the e2e lane reserves'],
])('it refuses the declaration %j', (lanes, message) => {
  expect(() => defineRig({ lanes })).toThrow(message);
});
