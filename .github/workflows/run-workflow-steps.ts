import { readFile, writeFile } from 'node:fs/promises';
import { $ } from 'bun';
import { isConditionMet } from '../../scripts/release/is-condition-met.ts';
import { loadWorkflowStep } from './load-workflow-step.ts';

export interface WorkflowStepsOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;

  readonly expressions: Readonly<Record<string, string>>;

  readonly outputPath: string;
}

export async function runWorkflowSteps(
  workflow: string,
  job: string,
  stepNames: readonly string[],
  options: WorkflowStepsOptions,
): Promise<number> {
  const values = new Map(Object.entries(options.expressions));

  for (const name of stepNames) {
    const step = await loadWorkflowStep(workflow, job, name);

    if (step.condition !== null && !isConditionMet(step.condition, values)) {
      continue;
    }

    const stepEnv = Object.fromEntries(
      Object.entries(step.env).map(([key, value]) => [key, resolveValue(value, values)]),
    );

    await writeFile(options.outputPath, '');

    const result = await $`bash -c ${step.run}`
      .cwd(options.cwd)
      .env({ ...options.env, ...stepEnv, GITHUB_OUTPUT: options.outputPath })
      .nothrow()
      .quiet();

    if (result.exitCode !== 0) {
      return result.exitCode;
    }

    const output = await readFile(options.outputPath, 'utf8');

    for (const [key, value] of parseOutputs(output)) {
      values.set(`steps.${step.id ?? ''}.outputs.${key}`, value);
    }
  }

  return 0;
}

// An env value is literal text or one expression. The expression joins
// operands with && and ||, which take operand values as GitHub's do. An
// operand is a name, a quoted text, toJSON(<object>) or a comparison.
function resolveValue(value: string, values: ReadonlyMap<string, string>): string {
  const body = /^\$\{\{ (?<body>.+) \}\}$/su.exec(value)?.groups?.['body'];

  if (body === undefined) {
    if (value.includes('${{')) {
      throw new Error(`unsupported expression: ${value}`);
    }

    return value;
  }

  const alternatives = parseExpression(body);

  if (alternatives === null) {
    throw new Error(`unsupported expression: ${value}`);
  }

  return String(evaluateAlternatives(alternatives, values));
}

interface Operand {
  readonly object: string | undefined;
  readonly text: string | undefined;
  readonly literal: string | undefined;
  readonly name: string | undefined;
  readonly equal: boolean | undefined;
  readonly expected: string | undefined;
}

// Reads the operands one at a time from the start, so a ` && ` or ` || `
// inside a quoted text stays part of that text. && binds tighter than ||.
function parseExpression(body: string): Operand[][] | null {
  const operandPattern =
    /(?:toJSON\((?<object>[\w.-]+)\)|'(?<text>[^']*)'|(?<literal>true|false)(?![\w.-])|(?<name>[\w.-]+))(?: (?<operator>==|!=) (?:'(?<expected>[^']*)'|(?<expectedLiteral>true|false)))?/uy;

  const alternatives: Operand[][] = [];
  let operands: Operand[] = [];
  let index = 0;

  while (true) {
    operandPattern.lastIndex = index;

    const groups = operandPattern.exec(body)?.groups;

    if (groups === undefined) {
      return null;
    }

    operands.push({
      object: groups['object'],
      text: groups['text'],
      literal: groups['literal'],
      name: groups['name'],
      equal: groups['operator'] === undefined ? undefined : groups['operator'] === '==',
      expected: groups['expected'] ?? groups['expectedLiteral'],
    });

    index = operandPattern.lastIndex;

    if (index === body.length) {
      return [...alternatives, operands];
    }

    if (body.startsWith(' || ', index)) {
      alternatives.push(operands);

      operands = [];
    } else if (!body.startsWith(' && ', index)) {
      return null;
    }

    index += ' && '.length;
  }
}

type ExpressionValue = string | boolean;

// || takes the first truthy alternative, or the last; && takes the first
// falsy operand, or the last. Neither reads an operand after it decides.
function evaluateAlternatives(
  alternatives: readonly (readonly Operand[])[],
  values: ReadonlyMap<string, string>,
): ExpressionValue {
  let result: ExpressionValue = '';

  for (const operands of alternatives) {
    for (const operand of operands) {
      result = evaluateOperand(operand, values);

      if (!isTruthy(result)) {
        break;
      }
    }

    if (isTruthy(result)) {
      return result;
    }
  }

  return result;
}

function evaluateOperand(operand: Operand, values: ReadonlyMap<string, string>): ExpressionValue {
  const value = readOperandValue(operand, values);

  if (operand.equal === undefined) {
    return value;
  }

  return (String(value) === operand.expected) === operand.equal;
}

function readOperandValue(operand: Operand, values: ReadonlyMap<string, string>): ExpressionValue {
  if (operand.object !== undefined) {
    return buildJSON(operand.object, values);
  }

  if (operand.text !== undefined) {
    return operand.text;
  }

  if (operand.literal !== undefined) {
    return operand.literal === 'true';
  }

  return getValue(operand.name ?? '', values);
}

// Builds the object from every value whose name starts with the object's
// name, as GitHub's toJSON prints it; an object with no values prints {}.
function buildJSON(object: string, values: ReadonlyMap<string, string>): string {
  const prefix = `${object}.`;

  const entries = [...values]
    .filter(([name]) => name.startsWith(prefix))
    .map(([name, value]): readonly [string, string] => [name.slice(prefix.length), value]);

  return JSON.stringify(Object.fromEntries<string>(entries), null, 2);
}

function getValue(expression: string, values: ReadonlyMap<string, string>): string {
  const value = values.get(expression);

  if (value === undefined) {
    throw new Error(`no value for ${expression}`);
  }

  return value;
}

function isTruthy(value: ExpressionValue): boolean {
  return value !== '' && value !== false;
}

function parseOutputs(text: string): [string, string][] {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const separator = line.indexOf('=');

      if (separator === -1) {
        throw new Error(`unsupported output line: ${line}`);
      }

      return [line.slice(0, separator), line.slice(separator + 1)];
    });
}
