import { expect, test } from 'bun:test';
import { collectEvalFiles } from './collect-eval-files.ts';

test('it collects the run script of each evaluation suite', () => {
  const files = [
    'packages/kettle/evals/taste/run-taste-eval.ts',
    'packages/kettle/evals/taste/cases.ts',
    'evals/steam/run-steam-eval.ts',
  ];

  expect(collectEvalFiles(files)).toStrictEqual([
    'packages/kettle/evals/taste/run-taste-eval.ts',
    'evals/steam/run-steam-eval.ts',
  ]);
});

test('it leaves out a run script whose name differs from its folder', () => {
  expect(collectEvalFiles(['evals/taste/run-steam-eval.ts'])).toBeEmpty();
});

test('it leaves out a script that is not in an evals folder', () => {
  expect(collectEvalFiles(['src/taste/run-taste-eval.ts'])).toBeEmpty();
});
