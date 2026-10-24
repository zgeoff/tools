import { readFile, writeFile } from 'node:fs/promises';
import { $ } from 'bun';
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

function isConditionMet(condition: string, values: ReadonlyMap<string, string>): boolean {
  const comparison = /^(?<expression>[\w.-]+) == '(?<expected>[^']*)'$/u.exec(condition);

  if (comparison?.groups === undefined) {
    throw new Error(`unsupported condition: ${condition}`);
  }

  return getValue(comparison.groups['expression'] ?? '', values) === comparison.groups['expected'];
}

function getValue(expression: string, values: ReadonlyMap<string, string>): string {
  const value = values.get(expression);

  if (value === undefined) {
    throw new Error(`no value for ${expression}`);
  }

  return value;
}

function resolveValue(value: string, values: ReadonlyMap<string, string>): string {
  const expression = /^\$\{\{ (?<name>[\w.-]+) \}\}$/u.exec(value)?.groups?.['name'];

  if (expression !== undefined) {
    return getValue(expression, values);
  }

  if (value.includes('${{')) {
    throw new Error(`unsupported expression: ${value}`);
  }

  return value;
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
