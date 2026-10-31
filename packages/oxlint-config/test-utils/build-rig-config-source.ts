import { join } from 'node:path';

// The text of a rig.config.ts that imports defineRig from rig's source by absolute path, so a lint
// tree needs no built package. `declaration` is the argument of defineRig.
export function buildRigConfigSource(declaration: string): string {
  const rigIndex = join(import.meta.dir, '..', '..', 'rig', 'src', 'index.ts');

  return `import { defineRig } from ${JSON.stringify(rigIndex)};\n\nexport default defineRig(${declaration});\n`;
}
