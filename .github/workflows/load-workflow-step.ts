import { readFile } from 'node:fs/promises';

export interface WorkflowStep {
  readonly id: string | null;

  readonly condition: string | null;

  readonly env: Readonly<Record<string, string>>;

  readonly run: string;
}

export async function loadWorkflowStep(
  path: string,
  job: string,
  step: string,
): Promise<WorkflowStep> {
  const text = await readFile(path, 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const steps = findField(findField(findField(workflow, 'jobs'), job), 'steps');

  if (!Array.isArray(steps)) {
    throw new TypeError(`${path}: the ${job} job has no steps`);
  }

  const list: unknown[] = steps;
  const found = list.find((candidate) => findField(candidate, 'name') === step);
  const run = findField(found, 'run');

  if (typeof run !== 'string') {
    throw new TypeError(`${path}: the ${job} job has no step named ${step} with a run script`);
  }

  const id = findField(found, 'id');
  const condition = findField(found, 'if');
  const env = findField(found, 'env');
  const entries = typeof env === 'object' && env !== null ? Object.entries(env) : [];

  return {
    id: typeof id === 'string' ? id : null,
    condition: typeof condition === 'string' ? condition : null,
    env: Object.fromEntries(entries.map(([name, value]) => [name, String(value)])),
    run,
  };
}

function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.entries(value).find(([name]) => name === key)?.[1];
}
