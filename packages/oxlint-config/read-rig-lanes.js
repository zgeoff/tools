import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import resolveRepoRoot from './resolve-repo-root.js';

// Returns the limit in ms of each lane that the repo's rig.config.ts resolves, keyed by the lane
// suffix without its dot, and `e2e` for the directory lane. Returns null for a repo with no
// rig.config.ts, which leaves the rules on their own lane table.
export default async function readRigLanes(cwd) {
  const root = resolveRepoRoot(join(cwd, 'oxlint'));

  if (root === null) {
    return null;
  }

  const configPath = join(root, 'rig.config.ts');

  if (!existsSync(configPath)) {
    return null;
  }

  const config = await importConfig(configPath);
  const lanes = config.default?.lanes;

  if (!Array.isArray(lanes)) {
    throw new TypeError(
      `${configPath} must default-export the result of defineRig from @zgeoff/rig`,
    );
  }

  return new Map(
    lanes
      .filter((lane) => lane.name !== 'unit')
      .map((lane) => [lane.suffix === null ? lane.name : lane.suffix.slice(1), lane.limitMs]),
  );
}

// oxlint runs a plugin under Node, which strips the types of a .ts file from Node 22.18, and Bun
// runs one as it is.
async function importConfig(configPath) {
  try {
    return await import(pathToFileURL(configPath).href);
  } catch (error) {
    throw new Error(
      `cannot load ${configPath}: reading a TypeScript config needs Node >= 22.18 or Bun`,
      { cause: error },
    );
  }
}
