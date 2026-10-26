import { P, match } from 'ts-pattern';
import { parseWorkflowActionStep } from './parse-workflow-action-step.ts';
import type { WorkflowActionStep } from './parse-workflow-action-step.ts';

// The release job's tag step must call the same release-please pin as its
// first call, with the App token, and open no release PR of its own.
export function collectReleaseWorkflowFaults(text: string): string[] {
  const release = parseWorkflowActionStep(text, 'release', 'Run release-please');
  const tag = parseWorkflowActionStep(text, 'release', 'Tag the merged release');

  return match([release, tag] as const)
    .with([{ kind: 'parsed' }, { kind: 'parsed' }], ([first, second]) =>
      collectTagStepFaults(first.step, second.step),
    )
    .with([{ kind: 'missing' }, P._], [P._, { kind: 'missing' }], (results) =>
      results.flatMap((result) =>
        match(result)
          .with({ kind: 'missing' }, (missing) => [missing.message])
          .with({ kind: 'parsed' }, () => [])
          .exhaustive(),
      ),
    )
    .exhaustive();
}

function collectTagStepFaults(release: WorkflowActionStep, tag: WorkflowActionStep): string[] {
  return [
    ...(tag.uses === release.uses
      ? []
      : [`Tag the merged release uses ${tag.uses}, but Run release-please uses ${release.uses}`]),
    ...(tag.inputs['token'] === `\${{ steps.app-token.outputs.token }}`
      ? []
      : ['Tag the merged release must pass the App token as its token input']),
    ...(tag.inputs['skip-github-pull-request'] === 'true'
      ? []
      : ['Tag the merged release must set skip-github-pull-request: true']),
  ];
}
