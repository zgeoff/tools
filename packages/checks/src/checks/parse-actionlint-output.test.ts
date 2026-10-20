import { expect, test } from 'bun:test';
import { parseActionlintOutput } from './parse-actionlint-output.ts';

test('it reads a clean run as no findings', () => {
  expect(parseActionlintOutput({ exitCode: 0, stdout: '[]\n', stderr: '' })).toStrictEqual([]);
});

test('it reports each error at its path and line', () => {
  const stdout = JSON.stringify([
    {
      message: 'label "ubuntu-lastest" is unknown',
      filepath: '.github/workflows/build.yml',
      line: 4,
      column: 14,
      kind: 'runner-label',
      snippet: '    runs-on: ubuntu-lastest\n             ^~~~~~~~~~~~~~',
      end_column: 27,
    },
    {
      message: 'could not parse as YAML: did not find expected node content',
      filepath: '.github/workflows/deploy.yaml',
      line: 2,
      column: 1,
      kind: 'syntax-check',
      snippet: 'jobs: [\n^',
      end_column: 1,
    },
  ]);

  expect(parseActionlintOutput({ exitCode: 1, stdout, stderr: '' })).toStrictEqual([
    {
      path: '.github/workflows/build.yml',
      line: 4,
      message: 'actionlint: label "ubuntu-lastest" is unknown [runner-label]',
    },
    {
      path: '.github/workflows/deploy.yaml',
      line: 2,
      message:
        'actionlint: could not parse as YAML: did not find expected node content [syntax-check]',
    },
  ]);
});

test.each([
  [
    'an exit above 1',
    {
      exitCode: 3,
      stdout: '',
      stderr: 'could not read "gone.yml": open gone.yml: no such file or directory\n',
    },
    'workflows: actionlint failed: could not read "gone.yml": open gone.yml: no such file or directory',
  ],
  [
    'an exit of 1 with no error it can read',
    { exitCode: 1, stdout: '[]\n', stderr: 'out of memory\n' },
    'workflows: actionlint failed: out of memory',
  ],
  [
    'output that is not JSON',
    { exitCode: 1, stdout: 'panic: runtime error\n', stderr: '' },
    'workflows: actionlint printed output that is not JSON: panic: runtime error',
  ],
  [
    'JSON of an unknown shape',
    { exitCode: 1, stdout: '[{"file":"build.yml"}]\n', stderr: '' },
    'workflows: actionlint printed an unknown shape: [{"file":"build.yml"}]',
  ],
])('it throws on %s', (_label, result, message) => {
  expect(() => parseActionlintOutput(result)).toThrowWithMessage(Error, message);
});
