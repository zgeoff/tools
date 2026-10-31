import { expect, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { parseRigConfig } from './parse-rig-config.ts';

test('it accepts what defineRig returns', () => {
  const config = defineRig({ lanes: { kiln: { limit: '15s', memory: '8G' } } });

  expect(parseRigConfig(config)).toStrictEqual({ kind: 'parsed', config });
});

test.each([
  ['null', null, 'the default export has no lanes'],
  ['a string', 'lanes', 'the default export has no lanes'],
  ['an object with no lanes', {}, 'the default export has no lanes'],
  ['lanes that are no list', { lanes: { unit: {} } }, 'its lanes are no list'],
  ['a lane that is no object', { lanes: ['unit'] }, 'lane 0 is no object'],
  [
    'a lane with no name',
    { lanes: [{ suffix: null, limitMs: 1, parallel: 1, memory: null, start: null, stop: null }] },
    'lane 0 has no name',
  ],
  [
    'a lane with a suffix that is no text',
    {
      lanes: [
        { name: 'a', suffix: 3, limitMs: 5, parallel: 1, memory: null, start: null, stop: null },
      ],
    },
    'lane "a" has the suffix 3, which defineRig never resolves',
  ],
  [
    'a lane with a limit in text',
    {
      lanes: [
        {
          name: 'a',
          suffix: null,
          limitMs: '5s',
          parallel: 1,
          memory: null,
          start: null,
          stop: null,
        },
      ],
    },
    'lane "a" has the limitMs "5s", which defineRig never resolves',
  ],
  [
    'a lane with parallel 0',
    {
      lanes: [
        { name: 'a', suffix: null, limitMs: 5, parallel: 0, memory: null, start: null, stop: null },
      ],
    },
    'lane "a" has the parallel 0, which defineRig never resolves',
  ],
  [
    'a lane with an undefined memory',
    { lanes: [{ name: 'a', suffix: null, limitMs: 5, parallel: 1, start: null, stop: null }] },
    'lane "a" has the memory undefined, which defineRig never resolves',
  ],
  [
    'a lane with a start that is no text',
    {
      lanes: [
        { name: 'a', suffix: null, limitMs: 5, parallel: 1, memory: null, start: 1, stop: null },
      ],
    },
    'lane "a" has the start 1, which defineRig never resolves',
  ],
  [
    'a lane with a stop that is no text',
    {
      lanes: [
        { name: 'a', suffix: null, limitMs: 5, parallel: 1, memory: null, start: null, stop: 1 },
      ],
    },
    'lane "a" has the stop 1, which defineRig never resolves',
  ],
])('it refuses %s, and names the reason', (_title, value, reason) => {
  expect(parseRigConfig(value)).toStrictEqual({ kind: 'refused', reason });
});

test('it refuses a config by its first bad lane', () => {
  const value = {
    lanes: [
      { name: 'a', suffix: null, limitMs: 5, parallel: 1, memory: null, start: null, stop: null },
      {
        name: 'b',
        suffix: null,
        limitMs: '5s',
        parallel: 1,
        memory: null,
        start: null,
        stop: null,
      },
      { name: 'c', suffix: null, limitMs: 5, parallel: 0, memory: null, start: null, stop: null },
    ],
  };

  expect(parseRigConfig(value)).toStrictEqual({
    kind: 'refused',
    reason: 'lane "b" has the limitMs "5s", which defineRig never resolves',
  });
});
