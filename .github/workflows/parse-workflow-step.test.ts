import { expect, test } from 'bun:test';
import { parseWorkflowStep } from './parse-workflow-step.ts';

test('it returns the condition, action, inputs and env of the named step', () => {
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
    '        env:',
    '          LEAF: green',
    '',
  ].join('\n');

  const step = parseWorkflowStep(text, 'build', 'Brew');

  expect(step).toStrictEqual({
    kind: 'parsed',
    step: {
      index: 1,
      condition: "steps.kettle.outputs.hot == 'true'",
      uses: 'acme/brew-action@v2',
      inputs: { token: `\${{ steps.token.outputs.token }}`, strong: 'true', cups: '2' },
      env: { LEAF: 'green' },
    },
  });
});

test('it returns no action, condition, inputs or env for a script step without them', () => {
  const text = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Greet',
    '        run: echo "hello"',
    '',
  ].join('\n');

  const step = parseWorkflowStep(text, 'build', 'Greet');

  expect(step).toStrictEqual({
    kind: 'parsed',
    step: { index: 0, condition: null, uses: null, inputs: {}, env: {} },
  });
});

test('it reports a step the job lacks as missing', () => {
  const text = [
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Greet',
    '        run: echo "hello"',
    '',
  ].join('\n');

  const step = parseWorkflowStep(text, 'build', 'Pour');

  expect(step).toStrictEqual({ kind: 'missing', message: 'the build job has no step named Pour' });
});

test('it reports a job with no steps as missing', () => {
  const text = ['jobs:', '  build:', '    runs-on: ubuntu-latest', ''].join('\n');
  const step = parseWorkflowStep(text, 'build', 'Brew');

  expect(step).toStrictEqual({ kind: 'missing', message: 'the build job has no steps' });
});
