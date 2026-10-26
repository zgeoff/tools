import { expect, test } from 'bun:test';
import { parseWorkflowActionStep } from './parse-workflow-action-step.ts';

test('it returns the condition, action and inputs of the named step', () => {
  const text = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Greet',
    '        run: echo "hello"',
    '      - name: Brew',
    "        if: steps.kettle.outputs.hot == 'true'",
    '        uses: acme/brew-action@v2',
    '        with:',
    `          token: \${{ steps.token.outputs.token }}`,
    '          strong: true',
    '          cups: 2',
    '',
  ].join('\n');

  const step = parseWorkflowActionStep(text, 'build', 'Brew');

  expect(step).toStrictEqual({
    kind: 'parsed',
    step: {
      condition: "steps.kettle.outputs.hot == 'true'",
      uses: 'acme/brew-action@v2',
      inputs: { token: `\${{ steps.token.outputs.token }}`, strong: 'true', cups: '2' },
    },
  });
});

test('it returns no condition and no inputs for a step without them', () => {
  const text = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Brew',
    '        uses: acme/brew-action@v2',
    '',
  ].join('\n');

  const step = parseWorkflowActionStep(text, 'build', 'Brew');

  expect(step).toStrictEqual({
    kind: 'parsed',
    step: { condition: null, uses: 'acme/brew-action@v2', inputs: {} },
  });
});

test.each([
  [
    'a step that runs a script',
    'Greet',
    'the build job has no step named Greet that uses an action',
  ],
  ['a missing step', 'Pour', 'the build job has no step named Pour that uses an action'],
])('it reports %s as missing', (_, name, message) => {
  const text = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Greet',
    '        run: echo "hello"',
    '',
  ].join('\n');

  const step = parseWorkflowActionStep(text, 'build', name);

  expect(step).toStrictEqual({ kind: 'missing', message });
});

test('it reports a job with no steps as missing', () => {
  const text = ['jobs:', '  build:', '    runs-on: ubuntu-latest', ''].join('\n');
  const step = parseWorkflowActionStep(text, 'build', 'Brew');

  expect(step).toStrictEqual({ kind: 'missing', message: 'the build job has no steps' });
});
