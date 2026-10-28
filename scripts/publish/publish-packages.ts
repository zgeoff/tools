import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { parseTextList } from '../release/parse-text-list.ts';
import { parseTextRecord } from '../release/parse-text-record.ts';

export interface PackagesPublishOptions {
  readonly cwd: string;

  readonly env: Readonly<Record<string, string | undefined>>;

  readonly pathsText: string;

  readonly releasedVersionsText: string;

  readonly writeOutput: (text: string) => void;

  readonly writeError: (text: string) => void;
}

// npm publishes, not bun: trusted publishing (OIDC) needs npm 11.5.1 or newer, and bun publish has
// no OIDC support (oven-sh/bun#15601). bun packs, because it turns catalog: and workspace:
// versions into exact ones, which npm pack ships unchanged.
export async function publishPackages(options: PackagesPublishOptions): Promise<number> {
  const pathsText = options.pathsText === '' ? '[]' : options.pathsText;
  const versionsText = options.releasedVersionsText === '' ? '{}' : options.releasedVersionsText;
  const paths = parseTextList(pathsText);
  const releasedVersions = parseTextRecord(versionsText);

  if (paths === null || releasedVersions === null) {
    options.writeError(
      '::error::PATHS_RELEASED holds no JSON array of paths, or RELEASED_VERSIONS no JSON object of versions\n',
    );

    return 1;
  }

  const packages = await Promise.all(
    paths.map((path) => readPackage(join(options.cwd, path), releasedVersions[path])),
  );

  // A tag whose version the checkout does not hold fails the run before anything publishes, which
  // the already-published skip would otherwise hide.
  const mismatches = packages.filter(
    (entry) => entry.releasedVersion !== undefined && entry.releasedVersion !== entry.version,
  );

  if (mismatches.length > 0) {
    for (const entry of mismatches) {
      options.writeError(
        `::error::${entry.name}: the release tagged ${entry.releasedVersion ?? ''} but ${join(entry.folder, 'package.json')} holds ${entry.version}\n`,
      );
    }

    return 1;
  }

  for (const entry of packages) {
    await publishPackage(entry, options);
  }

  return 0;
}

interface ReleasedPackage {
  readonly folder: string;
  readonly name: string;
  readonly version: string;
  readonly isPrivate: boolean;
  readonly hasBuild: boolean;
  readonly releasedVersion: string | undefined;
}

async function readPackage(
  folder: string,
  releasedVersion: string | undefined,
): Promise<ReleasedPackage> {
  const text = await readFile(join(folder, 'package.json'), 'utf8');

  const manifest: unknown = JSON.parse(text);

  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error(`${folder}/package.json holds no JSON object`);
  }

  const name = 'name' in manifest ? manifest.name : undefined;
  const version = 'version' in manifest ? manifest.version : undefined;

  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new TypeError(`${folder}/package.json names no package and version`);
  }

  const scripts = 'scripts' in manifest ? manifest.scripts : undefined;

  return {
    folder,
    name,
    version,
    isPrivate: 'private' in manifest && manifest.private === true,
    hasBuild: typeof scripts === 'object' && scripts !== null && 'build' in scripts,
    releasedVersion,
  };
}

// The registry check makes a rerun after a partial publish skip the packages already on npm.
async function publishPackage(
  entry: ReleasedPackage,
  options: PackagesPublishOptions,
): Promise<void> {
  const env = { ...options.env };

  if (entry.isPrivate) {
    options.writeOutput(`skipping ${entry.name}: private\n`);

    return;
  }

  const published = await $`npm view ${`${entry.name}@${entry.version}`} version`
    .cwd(entry.folder)
    .env(env)
    .nothrow()
    .quiet();

  if (published.stdout.toString().trim() === entry.version) {
    options.writeOutput(`skipping ${entry.name}@${entry.version}: already published\n`);

    return;
  }

  if (entry.hasBuild) {
    await $`bun run build`.cwd(entry.folder).env(env);
  }

  await $`bun pm pack`.cwd(entry.folder).env(env);

  const files = await readdir(entry.folder);

  const tarballs = files.filter((file) => file.endsWith('.tgz'));
  const [tarball] = tarballs;

  if (tarballs.length !== 1 || tarball === undefined) {
    throw new Error(`bun pm pack left ${tarballs.length} tarballs in ${entry.folder}`);
  }

  await $`npm publish ${`./${tarball}`} --provenance --access public`.cwd(entry.folder).env(env);
}

if (import.meta.main) {
  process.exitCode = await publishPackages({
    cwd: process.cwd(),
    env: process.env,
    pathsText: process.env['PATHS_RELEASED'] ?? '',
    releasedVersionsText: process.env['RELEASED_VERSIONS'] ?? '',
    writeOutput: (text) => {
      process.stdout.write(text);
    },
    writeError: (text) => {
      process.stderr.write(text);
    },
  });
}
