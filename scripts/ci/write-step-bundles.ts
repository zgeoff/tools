import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  stepBundlesFolder,
  stepScriptSets,
  toStepRunPath,
  toStepToolsPath,
} from './download-step-scripts.ts';
import type { FileSystem } from './file-system.ts';
import { nodeFileSystem } from './node-file-system.ts';

export interface StepBundle {
  // The bundle's repo path, under the step bundles folder.
  readonly path: string;

  readonly text: string;
}

export interface BundleConfig {
  readonly entrypoints: string[];
  readonly root: string;
  readonly target: 'bun';
}

export interface BundleOutput {
  readonly text: () => Promise<string>;
}

// Bun.build fits this type: it inlines every file and package a script imports, and leaves Bun and
// Node built-ins as imports, which every runner has.
export type BuildBundle = (
  config: BundleConfig,
) => Promise<{ readonly outputs: readonly BundleOutput[] }>;

export function readStepBundles(
  root: string,
  entries: readonly string[],
  build: BuildBundle,
): Promise<StepBundle[]> {
  const scripts = [...new Set(entries)].filter((entry) => entry.endsWith('.ts')).toSorted();

  return Promise.all(
    scripts.map(async (entry) => {
      const result = await build({ entrypoints: [join(root, entry)], root, target: 'bun' });

      const [output] = result.outputs;

      if (output === undefined) {
        throw new Error(`bun build wrote no bundle for ${entry}`);
      }

      return { path: toStepToolsPath(toStepRunPath(entry)), text: await output.text() };
    }),
  );
}

// Returns each bundle path whose committed text differs from a fresh build, is missing, or has no
// step script left to build it.
export function collectStaleStepBundles(
  bundles: readonly StepBundle[],
  committed: ReadonlyMap<string, string>,
): string[] {
  const built = new Set(bundles.map((bundle) => bundle.path));

  const changed = bundles
    .filter((bundle) => committed.get(bundle.path) !== bundle.text)
    .map((bundle) => bundle.path);

  const orphaned = [...committed.keys()].filter((path) => !built.has(path));

  return [...changed, ...orphaned].toSorted();
}

export type BundleFiles = Pick<
  FileSystem,
  'readFilePaths' | 'readText' | 'writeText' | 'removePath'
>;

export async function readCommittedStepBundles(
  root: string,
  files: BundleFiles,
): Promise<Map<string, string>> {
  const paths = await files.readFilePaths(join(root, stepBundlesFolder));

  const entries = await Promise.all(
    paths
      .filter((path) => path.endsWith('.js'))
      .map(async (path): Promise<[string, string]> => {
        const repoPath = `${stepBundlesFolder}/${path}`;

        return [repoPath, await files.readText(join(root, repoPath))];
      }),
  );

  return new Map(entries);
}

export async function writeStepBundles(
  root: string,
  bundles: readonly StepBundle[],
  files: BundleFiles,
): Promise<void> {
  await files.removePath(join(root, stepBundlesFolder));

  for (const bundle of bundles) {
    await files.writeText(join(root, bundle.path), bundle.text);
  }
}

if (import.meta.main) {
  const root = join(import.meta.dir, '../..');
  const parsed = parseArgs({ options: { check: { type: 'boolean' } }, strict: true });

  const bundles = await readStepBundles(root, Object.values(stepScriptSets).flat(), (config) =>
    Bun.build(config),
  );

  if (parsed.values.check === true) {
    const committed = await readCommittedStepBundles(root, nodeFileSystem);

    const stale = collectStaleStepBundles(bundles, committed);

    for (const path of stale) {
      process.stderr.write(`${path}: stale; run bun run build:step-bundles and commit it\n`);
    }

    if (stale.length === 0) {
      process.stdout.write(`step bundles: ${bundles.length} fresh\n`);
    }

    process.exitCode = stale.length === 0 ? 0 : 1;
  } else {
    await writeStepBundles(root, bundles, nodeFileSystem);

    process.stdout.write(`step bundles: wrote ${bundles.length}\n`);
  }
}
