import { expect, test } from 'bun:test';
import { runGit } from '../../std/src/test-utils/run-git.ts';

test('it reaches the git helper', () => {
  expect(runGit).toBeFunction();
});
