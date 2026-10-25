import { readFile } from 'node:fs/promises';

export interface WorkflowActionStep {
  readonly condition: string | null;

  readonly uses: string;

  readonly inputs: Readonly<Record<string, string>>;
}

export async function loadWorkflowActionStep(
  path: string,
  job: string,
  step: string,
): Promise<WorkflowActionStep> {
  const text = await readFile(path, 'utf8');

  const workflow: unknown = Bun.YAML.parse(text);
  const steps = findField(findField(findField(workflow, 'jobs'), job), 'steps');

  if (!Array.isArray(steps)) {
    throw new TypeError(`${path}: the ${job} job has no steps`);
  }

  const list: unknown[] = steps;
  const found = list.find((candidate) => findField(candidate, 'name') === step);
  const uses = findField(found, 'uses');

  if (typeof uses !== 'string') {
    throw new TypeError(`${path}: the ${job} job has no step named ${step} that uses an action`);
  }

  const condition = findField(found, 'if');
  const inputs = findField(found, 'with');
  const entries = typeof inputs === 'object' && inputs !== null ? Object.entries(inputs) : [];

  return {
    condition: typeof condition === 'string' ? condition : null,
    uses,
    inputs: Object.fromEntries(entries.map(([name, value]) => [name, String(value)])),
  };
}

function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.entries(value).find(([name]) => name === key)?.[1];
}
