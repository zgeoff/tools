import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { isConditionMet } from './is-condition-met.ts';
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

interface ConditionRule {
  readonly name: StepName;

  readonly fault: string;

  // Each case gives the expression values and whether the step must run.
  readonly cases: readonly {
    readonly values: Readonly<Record<string, string>>;
    readonly runs: boolean;
  }[];
}

const conditionRules: readonly ConditionRule[] = [
  {
    name: 'Auto-merge release PRs',
    fault: 'Auto-merge release PRs must run only with an App token and merge on',
    cases: [
      {
        values: { 'steps.app-token.outputs.token': 'app-token', 'inputs.merge': 'true' },
        runs: true,
      },
      {
        values: { 'steps.app-token.outputs.token': 'app-token', 'inputs.merge': 'false' },
        runs: false,
      },
      { values: { 'steps.app-token.outputs.token': '', 'inputs.merge': 'true' }, runs: false },
    ],
  },
  {
    name: "Check the merge against main's head",
    fault: "Check the merge against main's head must run only after this run's merge",
    cases: [
      { values: { 'steps.merge.outputs.merged': 'true' }, runs: true },
      { values: { 'steps.merge.outputs.merged': '' }, runs: false },
    ],
  },
  {
    name: 'Tag the merged release',
    fault:
      "Tag the merged release must run only after this run's merge, when the first release-please call released nothing",
    cases: [
      {
        values: {
          'steps.merge.outputs.merged': 'true',
          'steps.release.outputs.releases_created': 'false',
        },
        runs: true,
      },
      {
        values: {
          'steps.merge.outputs.merged': '',
          'steps.release.outputs.releases_created': 'false',
        },
        runs: false,
      },
      {
        values: {
          'steps.merge.outputs.merged': 'true',
          'steps.release.outputs.releases_created': 'true',
        },
        runs: false,
      },
    ],
  },
];

// Checks the step order, the conditions of the guarded steps, the tag
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
    ...conditionRules.flatMap((rule) => collectConditionFaults(rule, getStep(rule.name))),
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

function collectConditionFaults(rule: ConditionRule, step: WorkflowStepFields): string[] {
  const condition = step.condition;

  if (condition === null) {
    return [rule.fault];
  }

  const holds = rule.cases.every(
    (example) =>
      isConditionMet(condition, new Map(Object.entries(example.values))) === example.runs,
  );

  return holds ? [] : [rule.fault];
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
