import {
  downloadStepScripts,
  stepScriptSets,
  toStepRunPath,
  toStepToolsPath,
} from '../ci/download-step-scripts.ts';

export interface PinnedSourcesReading {
  readonly workflowPaths: readonly string[];

  readonly readFile: (path: string) => Promise<string | null>;
}

export async function readPinnedSources(
  reading: Readonly<PinnedSourcesReading>,
): Promise<string[]> {
  const reusable: string[] = [];

  for (const path of reading.workflowPaths.filter((candidate) => isWorkflowFile(candidate))) {
    const text = await reading.readFile(path);

    if (text !== null && isReusableWorkflow(text)) {
      reusable.push(path);
    }
  }

  const stepScripts = await downloadStepScripts({
    entries: Object.values(stepScriptSets)
      .flat()
      .map((entry) => toStepRunPath(entry)),
    destination: '',
    readToolsFile: async (path) => {
      const text = await reading.readFile(toStepToolsPath(path));

      return text ?? '';
    },
    writeFile: () => Promise.resolve(),
  });

  return [
    ...new Set([
      ...reusable,
      '.bun-version',
      'scripts/ci/download-step-scripts.ts',
      ...stepScripts.map((path) => toStepToolsPath(path)),
    ]),
  ];
}

function isWorkflowFile(path: string): boolean {
  return path.endsWith('.yml') || path.endsWith('.yaml');
}

function isReusableWorkflow(text: string): boolean {
  const workflow = parseWorkflow(text);

  if (typeof workflow !== 'object' || workflow === null || !('on' in workflow)) {
    return false;
  }

  const triggers = workflow.on;

  if (typeof triggers === 'string') {
    return triggers === 'workflow_call';
  }

  if (Array.isArray(triggers)) {
    return triggers.includes('workflow_call');
  }

  return typeof triggers === 'object' && triggers !== null && 'workflow_call' in triggers;
}

// GitHub runs no workflow it cannot parse, so a broken file at an old commit is no reusable
// workflow.
function parseWorkflow(text: string): unknown {
  try {
    const workflow: unknown = Bun.YAML.parse(text);

    return workflow;
  } catch {
    return null;
  }
}
