import { existsSync } from 'node:fs';
// oxlint-disable-next-line zgeoff/no-require -- only resolves rig's path from the repo root; an import loads it
import { createRequire } from 'node:module';
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
  const rig = await importRepoRig(root);
  const parsed = rig.parseRigConfig(config.default);

  if (parsed.kind === 'refused') {
    throw new TypeError(
      `${configPath} must default-export the result of defineRig from @zgeoff/rig: ${parsed.reason}`,
    );
  }

  return new Map(
    parsed.config.lanes
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
    // oxlint prints a plugin's load error without its cause, so the message carries the cause's.
    const reason = error instanceof Error ? error.message : String(error);

    throw new Error(
      `cannot load ${configPath}: ${reason} (reading a TypeScript config needs Node >= 22.18 or Bun)`,
      { cause: error },
    );
  }
}

// The parser comes from the @zgeoff/rig that the repo's rig.config.ts imports, so both read one
// version of the resolved table. A bare import would resolve from this package's folder instead.
function importRepoRig(root) {
  const rigPath = createRequire(join(root, 'package.json')).resolve('@zgeoff/rig');

  return import(pathToFileURL(rigPath).href);
}
