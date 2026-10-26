import { P, match } from 'ts-pattern';
import { parseWorkflowStep } from './parse-workflow-step.ts';
import type { WorkflowStepFields } from './parse-workflow-step.ts';

// The release job's tag step must call the same release-please pin as its
// first call, with the App token, and open no release PR of its own. The
// pick step must report the tag step's outputs when that step released.
export function collectReleaseWorkflowFaults(text: string): string[] {
  const steps = [
    parseWorkflowStep(text, 'release', 'Run release-please'),
    parseWorkflowStep(text, 'release', 'Tag the merged release'),
    parseWorkflowStep(text, 'release', 'Pick the release outputs'),
  ] as const;

  return match(steps)
    .with([{ kind: 'parsed' }, { kind: 'parsed' }, { kind: 'parsed' }], ([release, tag, pick]) => [
      ...collectTagStepFaults(release.step, tag.step),
      ...collectPickStepFaults(pick.step),
    ])
    .with(
      [{ kind: 'missing' }, P._, P._],
      [P._, { kind: 'missing' }, P._],
      [P._, P._, { kind: 'missing' }],
      (results) =>
        results.flatMap((result) =>
          match(result)
            .with({ kind: 'missing' }, (missing) => [missing.message])
            .with({ kind: 'parsed' }, () => [])
            .exhaustive(),
        ),
    )
    .exhaustive();
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
