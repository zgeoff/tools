import { expect, test } from 'bun:test';
import { isWorkflowPath } from './is-workflow-path.ts';

test.each([
  ['.github/workflows/pr.yml', true],
  ['.github/actionlint.yaml', false],
  ['sync/workflow-callers/pr.yml', false],
])('it reads %s as a workflow path: %p', (path, expected) => {
  expect(isWorkflowPath(path)).toBe(expected);
});
