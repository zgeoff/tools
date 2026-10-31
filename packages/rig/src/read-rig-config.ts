import { join } from 'node:path';
import { isRecord } from '@zgeoff/std';
import { defineRig } from './define-rig.ts';
import { parseRigConfig } from './parse-rig-config.ts';
import type { RigConfig } from './types.ts';

export interface RigConfigSources {
  readonly probeFile: (path: string) => boolean;
  readonly importModule: (path: string) => Promise<unknown>;
}

export async function readRigConfig(
  repoRoot: string,
  dependencies: RigConfigSources,
): Promise<RigConfig> {
  const path = join(repoRoot, 'rig.config.ts');

  if (!dependencies.probeFile(path)) {
    return defineRig({});
  }

  const loaded = await dependencies.importModule(path);

  const defaultExport = isRecord(loaded) ? loaded['default'] : null;
  const parsed = parseRigConfig(defaultExport);

  if (parsed.kind === 'refused') {
    throw new Error(`${path} must default-export the result of defineRig: ${parsed.reason}`);
  }

  return parsed.config;
}
