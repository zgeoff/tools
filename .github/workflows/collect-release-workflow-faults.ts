import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { parseWorkflowStep } from './parse-workflow-step.ts';
import type { WorkflowStepFields } from './parse-workflow-step.ts';

const stepNames = [
  "Check untagged releases against main's head",
  'Run release-please',
  'Auto-merge release PRs',
  "Check the merge against main's head",
  'Tag the merged release',
  'Pick the release outputs',
] as const;

type StepName = (typeof stepNames)[number];

// Checks main's head before each release-please call that can tag, the tag
// step's pin, token and release PR input, and the outputs the pick step
// reads.
export function collectReleaseWorkflowFaults(text: string): string[] {
  const steps = new Map<StepName, WorkflowStepFields>();

  const missing: string[] = [];

  for (const name of stepNames) {
    match(parseWorkflowStep(text, 'release', name))
      .with({ kind: 'parsed' }, (parsed) => {
        steps.set(name, parsed.step);
      })
      .with({ kind: 'missing' }, (result) => {
        missing.push(result.message);
      })
      .exhaustive();
  }

  if (missing.length > 0) {
    return missing;
  }

  const getStep = (name: StepName) => {
    const step = steps.get(name);

    invariant(step, `the loop above parsed ${name}`);

    return step;
  };

  return [
    ...collectOrderFaults(getStep),
    ...collectTagStepFaults(getStep('Run release-please'), getStep('Tag the merged release')),
    ...collectPickStepFaults(getStep('Pick the release outputs')),
  ];
}

function collectOrderFaults(getStep: (name: StepName) => WorkflowStepFields): string[] {
  const position = (name: StepName) => getStep(name).index;

  return [
    ...(position("Check untagged releases against main's head") < position('Run release-please')
      ? []
      : ["Check untagged releases against main's head must run before Run release-please"]),
    ...(position('Auto-merge release PRs') < position("Check the merge against main's head") &&
    position("Check the merge against main's head") < position('Tag the merged release')
      ? []
      : [
          "Check the merge against main's head must run after Auto-merge release PRs and before Tag the merged release",
        ]),
  ];
}

function collectTagStepFaults(release: WorkflowStepFields, tag: WorkflowStepFields): string[] {
  return [
    ...(tag.uses !== null && tag.uses === release.uses
      ? []
      : [
          `Tag the merged release uses ${tag.uses ?? 'no action'}, but Run release-please uses ${release.uses ?? 'no action'}`,
        ]),
    ...(tag.inputs['token'] === `\${{ steps.app-token.outputs.token }}`
      ? []
      : ['Tag the merged release must pass the App token as its token input']),
    ...(tag.inputs['skip-github-pull-request'] === 'true'
      ? []
      : ['Tag the merged release must set skip-github-pull-request: true']),
  ];
}

function collectPickStepFaults(pick: WorkflowStepFields): string[] {
  const expected = `\${{ steps.tag.outputs.releases_created == 'true' && toJSON(steps.tag.outputs) || toJSON(steps.release.outputs) }}`;

  return pick.env['RELEASE_OUTPUTS'] === expected
    ? []
    : [
        'Pick the release outputs must read RELEASE_OUTPUTS from the tag step when it released, and from Run release-please otherwise',
      ];
}
