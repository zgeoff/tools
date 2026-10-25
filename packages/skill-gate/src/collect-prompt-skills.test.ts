import { expect, test } from 'bun:test';
import { collectPromptSkills } from './collect-prompt-skills.ts';

test('it collects each skill the prompt names as $name once', () => {
  expect(
    collectPromptSkills(
      'Use $testing, then $docs-writing. Run $testing again, but not US$5 or a$b.',
    ),
  ).toStrictEqual(['testing', 'docs-writing']);
});

test('it collects nothing from a prompt with no $name', () => {
  expect(collectPromptSkills('Add a test for the rounding.')).toStrictEqual([]);
});
