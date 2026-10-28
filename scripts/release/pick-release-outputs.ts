import { nodeFileSystem } from '../ci/file-system.ts';
import { writeStepOutputs } from '../ci/write-step-outputs.ts';
import { parseReleaseOutputs } from './parse-release-outputs.ts';

export type ReleaseOutputsResult =
  | { readonly kind: 'picked'; readonly outputs: Readonly<Record<string, string>> }
  | { readonly kind: 'invalid'; readonly message: string };

// A single package at the root sets tag_name and version; a multi-package release sets them per
// path only, as <path>--tag_name and <path>--version, so the first released path stands in.
export function pickReleaseOutputs(releaseOutputsText: string): ReleaseOutputsResult {
  const parsed = parseReleaseOutputs(releaseOutputsText);

  if (parsed.kind === 'invalid') {
    return parsed;
  }

  const outputs = parsed.outputs;
  const [firstPath] = parsed.paths;

  const pickFirst = (key: string) =>
    outputs[key] ?? (firstPath === undefined ? undefined : outputs[`${firstPath}--${key}`]) ?? '';

  return {
    kind: 'picked',
    outputs: {
      releases_created: outputs['releases_created'] ?? 'false',
      tag: pickFirst('tag_name'),
      version: pickFirst('version'),
      'release-outputs': JSON.stringify(outputs),
    },
  };
}

async function runCLI(): Promise<void> {
  const result = pickReleaseOutputs(process.env['RELEASE_OUTPUTS'] ?? '');

  if (result.kind === 'invalid') {
    console.log(`::error::RELEASE_OUTPUTS: ${result.message}`);

    process.exitCode = 1;

    return;
  }

  await writeStepOutputs(nodeFileSystem, process.env['GITHUB_OUTPUT'] ?? '', result.outputs);
}

if (import.meta.main) {
  await runCLI();
}
