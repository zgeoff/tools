import { join } from 'node:path';
import { buildInitScripts } from './build-init-scripts.ts';
import type { InitFiles } from './init-files.ts';
import type { RigConfig, RigOutput } from './types.ts';

export interface InitDeps {
  readonly readTrackedFiles: (repoRoot: string) => Promise<readonly string[]>;

  readonly initFiles: InitFiles;

  readonly output: RigOutput;
}

const starterConfig = `import { defineRig } from '@zgeoff/rig';

export default defineRig({ lanes: {} });
`;

// A second run finds the scripts and the config in place and writes nothing.
export async function runInit(
  repoRoot: string,
  config: RigConfig,
  deps: InitDeps,
): Promise<number> {
  const manifestPath = join(repoRoot, 'package.json');

  const manifest = await deps.initFiles.readJSON(manifestPath);

  if (!isRecord(manifest)) {
    deps.output.err(`rig init: ${manifestPath} must hold a JSON object\n`);

    return 2;
  }

  const trackedFiles = await deps.readTrackedFiles(repoRoot);

  const oldScripts = readScripts(manifest['scripts']);
  const newScripts = buildInitScripts(oldScripts, config, trackedFiles);

  if (JSON.stringify(oldScripts) !== JSON.stringify(newScripts)) {
    await deps.initFiles.writeText(
      manifestPath,
      `${JSON.stringify({ ...manifest, scripts: newScripts }, null, 2)}\n`,
    );

    deps.output.out('rig init: wrote the test scripts to package.json\n');
  }

  const configPath = join(repoRoot, 'rig.config.ts');

  if (!(await deps.initFiles.probeFile(configPath))) {
    await deps.initFiles.writeText(configPath, starterConfig);

    deps.output.out('rig init: wrote rig.config.ts\n');
  }

  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readScripts(scripts: unknown): Record<string, string> {
  if (!isRecord(scripts)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}
