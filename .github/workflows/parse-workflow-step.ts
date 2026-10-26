export interface WorkflowStepFields {
  // The step's position in its job, from 0.
  readonly index: number;

  readonly condition: string | null;

  // null for a step that runs a script
  readonly uses: string | null;

  readonly inputs: Readonly<Record<string, string>>;

  readonly env: Readonly<Record<string, string>>;
}

// A step the workflow lacks is a result, because a check reports it as a fault.
export type WorkflowStepResult =
  | { readonly kind: 'parsed'; readonly step: WorkflowStepFields }
  | { readonly kind: 'missing'; readonly message: string };

export function parseWorkflowStep(text: string, job: string, step: string): WorkflowStepResult {
  const workflow: unknown = Bun.YAML.parse(text);
  const steps = findField(findField(findField(workflow, 'jobs'), job), 'steps');

  if (!Array.isArray(steps)) {
    return { kind: 'missing', message: `the ${job} job has no steps` };
  }

  const list: unknown[] = steps;
  const index = list.findIndex((candidate) => findField(candidate, 'name') === step);
  const found: unknown = list[index];

  if (index === -1) {
    return { kind: 'missing', message: `the ${job} job has no step named ${step}` };
  }

  const condition = findField(found, 'if');
  const uses = findField(found, 'uses');

  return {
    kind: 'parsed',
    step: {
      index,
      condition: typeof condition === 'string' ? condition : null,
      uses: typeof uses === 'string' ? uses : null,
      inputs: toTextRecord(findField(found, 'with')),
      env: toTextRecord(findField(found, 'env')),
    },
  };
}

function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.entries(value).find(([name]) => name === key)?.[1];
}

function toTextRecord(value: unknown): Record<string, string> {
  const entries = typeof value === 'object' && value !== null ? Object.entries(value) : [];

  return Object.fromEntries(entries.map(([name, field]) => [name, String(field)]));
}
