import { expect, test } from 'bun:test';
import { isConditionMet } from './is-condition-met.ts';

test.each([
  ["steps.pick.outputs.color == 'blue'", 'blue', true],
  ["steps.pick.outputs.color == 'blue'", 'red', false],
  ["steps.pick.outputs.color != 'blue'", 'red', true],
  ["steps.pick.outputs.color != 'blue'", 'blue', false],
])('it evaluates %s with the color %s as %p', (condition, color, expected) => {
  const met = isConditionMet(condition, new Map([['steps.pick.outputs.color', color]]));

  expect(met).toBe(expected);
});

test.each([
  ['blue', 'large', true],
  ['blue', 'small', false],
  ['red', 'large', false],
])(
  'it meets a condition of two comparisons joined by && only when both hold, with %s and %s as %p',
  (color, size, expected) => {
    const values = new Map([
      ['steps.pick.outputs.color', color],
      ['steps.pick.outputs.size', size],
    ]);

    const met = isConditionMet(
      "steps.pick.outputs.color == 'blue' && steps.pick.outputs.size != 'small'",
      values,
    );

    expect(met).toBe(expected);
  },
);

test.each([
  ['always()', 'unsupported condition: always()'],
  [
    "steps.pick.outputs.color == 'blue' || steps.pick.outputs.size == 'large'",
    "unsupported condition: steps.pick.outputs.color == 'blue' || steps.pick.outputs.size == 'large'",
  ],
  ["steps.pick.outputs.shade == 'dark'", 'no value for steps.pick.outputs.shade'],
])('it rejects %s', (condition, message) => {
  const values = new Map([
    ['steps.pick.outputs.color', 'blue'],
    ['steps.pick.outputs.size', 'large'],
  ]);

  expect(() => isConditionMet(condition, values)).toThrow(message);
});
