import { readFile } from 'node:fs/promises';

// Reads the run script of one step of one job from a workflow file, so a test can run the step's
// shell for real.
export async function readWorkflowStep(path: string, job: string, step: string): Promise<string> {
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

  return run;
}

function findField(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  return Object.entries(value).find(([name]) => name === key)?.[1];
}
