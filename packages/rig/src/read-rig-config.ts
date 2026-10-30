import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineRig } from './define-rig.ts';
import { parseRigConfig } from './parse-rig-config.ts';
import type { RigConfig } from './types.ts';

export async function readRigConfig(repoRoot: string): Promise<RigConfig> {
  const path = join(repoRoot, 'rig.config.ts');

  if (!existsSync(path)) {
    return defineRig({});
  }

  const loaded = await import(path).then((module: unknown) => module);

  const defaultExport: unknown =
    typeof loaded === 'object' && loaded !== null ? Reflect.get(loaded, 'default') : null;

  const config = parseRigConfig(defaultExport);

  if (config === null) {
    throw new Error(`${path} must default-export the result of defineRig`);
  }

  return config;
}
