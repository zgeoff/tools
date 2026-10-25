import { parseWorkflowActionStep } from './parse-workflow-action-step.ts';

// The release job's tag step must call the same release-please pin as its
// first call, with the App token, and open no release PR of its own.
export function collectReleaseWorkflowFaults(text: string): string[] {
  try {
    const release = parseWorkflowActionStep(text, 'release', 'Run release-please');
    const tag = parseWorkflowActionStep(text, 'release', 'Tag the merged release');

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
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
}
