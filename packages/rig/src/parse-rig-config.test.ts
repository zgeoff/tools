import { expect, test } from 'bun:test';
import { defineRig } from './define-rig.ts';
import { parseRigConfig } from './parse-rig-config.ts';

test('it accepts what defineRig returns', () => {
  const config = defineRig({ lanes: { kiln: { limit: '15s', memory: '8G' } } });

  expect(parseRigConfig(config)).toStrictEqual(config);
});

test.each([
  ['null', null],
  ['a string', 'lanes'],
  ['an object with no lanes', {}],
  ['lanes that are no list', { lanes: { unit: {} } }],
  ['a lane that is no object', { lanes: ['unit'] }],
  [
    'a lane with no name',
    { lanes: [{ suffix: null, limitMs: 1, parallel: 1, memory: null, start: null, stop: null }] },
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
  ],
  [
    'a lane with parallel 0',
    {
      lanes: [
        { name: 'a', suffix: null, limitMs: 5, parallel: 0, memory: null, start: null, stop: null },
      ],
    },
  ],
  [
    'a lane with an undefined memory',
    { lanes: [{ name: 'a', suffix: null, limitMs: 5, parallel: 1, start: null, stop: null }] },
  ],
])('it refuses %s', (_title, value) => {
  expect(parseRigConfig(value)).toBeNull();
});
