import { expect, test } from 'bun:test';
import { buildDietCommand } from './build-diet-command.ts';

test('it runs the command through the diet script with the lane budget', () => {
  expect(
    buildDietCommand('/work/node_modules/@zgeoff/diet/diet.sh', '8G', ['bun', 'test']),
  ).toStrictEqual([
    'bash',
    '/work/node_modules/@zgeoff/diet/diet.sh',
    '--budget',
    '8G',
    '--',
    'bun',
    'test',
  ]);
});

test('it leaves the budget to diet when the lane declares no memory', () => {
  expect(buildDietCommand('/diet.sh', null, ['bun', 'test'])).toStrictEqual([
    'bash',
    '/diet.sh',
    '--',
    'bun',
    'test',
  ]);
});
